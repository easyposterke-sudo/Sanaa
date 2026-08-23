import { useEffect, useState } from 'react';
import type { TemplatePosterSource } from '../../../shared/ai/templatePoster';
import { applyTemplateTheme } from '../ai/applyTemplateTheme';
import { preparePortrait, type PreparedPosterImage } from '../ai/preparePosterImage';
import { findPosterTemplateById, getAllPosterTemplates } from '../posterTemplateList';
import { fetchPosterTemplateById } from '../services/posterTemplatesApi';
import { requestTemplatePoster, TemplatePosterError } from '../services/templatePosterApi';
import { instantiateTemplate } from '../templateMerge';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterProject } from '../types';

interface GeneratedTemplatePoster {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
}

interface AIPosterWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (
    generated: GeneratedTemplatePoster,
    meta: { source: TemplatePosterSource; model: string | null },
  ) => void;
}

interface BriefImage {
  id: string;
  name: string;
  role: string;
  asset: PreparedPosterImage;
}

export function AIPosterWizard({ open, onClose, onApply }: AIPosterWizardProps) {
  const [brief, setBrief] = useState('');
  const [images, setImages] = useState<BriefImage[]>([]);
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [themeColor, setThemeColor] = useState('#6d28d9');
  const [preparingImages, setPreparingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excludedTemplateIds, setExcludedTemplateIds] = useState<string[]>([]);
  const [result, setResult] = useState<{
    source: TemplatePosterSource;
    model: string | null;
    templateId: string;
  } | null>(null);

  const templateCount = getAllPosterTemplates().filter(
    (template) => (template.fields?.length ?? 0) > 0,
  ).length;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setExcludedTemplateIds([]);
  }, [open]);

  if (!open) return null;

  const handleImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = Math.max(0, 8 - images.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) {
      setError('You can add up to 8 images.');
      return;
    }
    setPreparingImages(true);
    setError(null);
    try {
      const prepared = await Promise.all(
        selected.map(async (file) => ({
          id: crypto.randomUUID(),
          name: readableFileName(file.name),
          role: '',
          asset: await preparePortrait(file),
        })),
      );
      setImages((current) => [...current, ...prepared]);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparingImages(false);
    }
  };

  const updateImage = (id: string, changes: Partial<Pick<BriefImage, 'name' | 'role'>>) => {
    setImages((current) =>
      current.map((image) => (image.id === id ? { ...image, ...changes } : image)),
    );
  };

  const handleGenerate = async () => {
    setError(null);
    if (brief.trim().length < 10) {
      setError('Describe what you want to create, including the important event details.');
      return;
    }
    if (themeEnabled && !/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
      setError('Choose a valid six-digit theme color.');
      return;
    }

    const templates = getAllPosterTemplates().filter(
      (template) => (template.fields?.length ?? 0) > 0,
    );
    if (templates.length === 0) {
      setError('No fillable templates are available yet. Create and label a template first.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await requestTemplatePoster({
        brief: brief.trim(),
        themeColor: themeEnabled ? themeColor : null,
        images: images.map((image, index) => ({
          index,
          name: image.name.trim(),
          role: image.role.trim(),
        })),
        templates: templates.slice(0, 100).map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          description: template.description ?? '',
          fields: (template.fields ?? []).slice(0, 80).map((field) => ({
            key: field.key,
            label: field.label,
            kind: field.kind ?? 'text',
          })),
        })),
        excludedTemplateIds,
      });

      const selectedTemplate =
        findPosterTemplateById(response.selection.templateId) ??
        (await fetchPosterTemplateById(response.selection.templateId));
      const values: Record<string, string> = {};
      for (const field of selectedTemplate.fields ?? []) {
        if ((field.kind ?? 'text') === 'text') values[field.key] = '';
      }
      for (const field of response.selection.fields) {
        if (field.imageIndex !== null) {
          const image = images[field.imageIndex];
          if (image) values[field.key] = image.asset.dataUrl;
        } else if (field.value !== null) {
          values[field.key] = field.value;
        }
      }

      const instantiated = await instantiateTemplate(selectedTemplate, values, {
        clearMissingTextFields: true,
      });
      const generated = {
        ...instantiated,
        project: themeEnabled
          ? applyTemplateTheme(instantiated.project, themeColor)
          : instantiated.project,
      };
      onApply(generated, { source: response.source, model: response.model });
      setExcludedTemplateIds((current) =>
        current.includes(response.selection.templateId)
          ? current
          : [...current, response.selection.templateId],
      );
      setResult({
        source: response.source,
        model: response.model,
        templateId: response.selection.templateId,
      });
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-[80] flex justify-center sm:bottom-6" role="status">
        <div className="w-full max-w-xl rounded-2xl border border-emerald-300 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-emerald-800 dark:bg-zinc-900/95">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Your poster is ready</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Review it on the canvas. The template choice stays in the background.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={submitting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {submitting ? 'Finding another…' : 'Try another design'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Use this poster
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-poster-title"
    >
      <div className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 id="ai-poster-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
              What do you want to create today?
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              Describe the poster naturally. AI will privately match and fill the most suitable
              design from your template library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || preparingImages}
            className="ml-4 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section>
            <label className="block text-sm font-semibold text-zinc-900 dark:text-white" htmlFor="ai-poster-brief">
              Poster brief
            </label>
            <textarea
              id="ai-poster-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={13}
              maxLength={4_000}
              placeholder="Example: Create a worship experience poster for Sunday 20 September at 10:00 AM, at Grace Chapel. Theme: Arise and Worship. Scripture: Psalm 95:6. Hosted by Pastor Miriam, with guest minister John Kamau…"
              className={`${inputClass} resize-y`}
            />
            <div className="mt-2 flex justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Include the title, date, time, venue, theme, verse, hosts, guests, and any contact details you want shown.</span>
              <span className="shrink-0">{brief.length}/4000</span>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">People or guest images</h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Optional. One image can contain one person, a couple, or a group.
                  </p>
                </div>
                <label className="cursor-pointer rounded-lg border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                  {preparingImages ? 'Preparing…' : 'Add images'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    disabled={preparingImages || submitting || images.length >= 8}
                    onChange={(event) => {
                      const files = event.target.files;
                      event.target.value = '';
                      void handleImages(files);
                    }}
                  />
                </label>
              </div>

              {images.length === 0 ? (
                <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                  No images added. AI can still create the poster.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {images.map((image) => (
                    <div key={image.id} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                      <div className="flex gap-2">
                        <img
                          src={image.asset.dataUrl}
                          alt="Uploaded person"
                          className="h-20 w-20 shrink-0 rounded-md bg-zinc-100 object-contain dark:bg-zinc-950"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <input
                            value={image.name}
                            onChange={(event) => updateImage(image.id, { name: event.target.value })}
                            placeholder="Name or people in photo"
                            aria-label="Name or people in photo"
                            className={smallInputClass}
                          />
                          <input
                            value={image.role}
                            onChange={(event) => updateImage(image.id, { role: event.target.value })}
                            placeholder="Role, e.g. Host or Guest"
                            aria-label="Role for uploaded image"
                            className={smallInputClass}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}
                        className="mt-2 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        Remove image
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                Photos stay in your browser during matching. AI receives only the names and roles you enter.
              </p>
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="flex items-start gap-3">
                <input
                  id="ai-theme-enabled"
                  type="checkbox"
                  checked={themeEnabled}
                  onChange={(event) => setThemeEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <label htmlFor="ai-theme-enabled" className="flex-1">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">Use a theme color</span>
                  <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Recolors the selected template's background, shapes, panels, and decorative accents.
                  </span>
                </label>
              </div>
              {themeEnabled && (
                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : '#6d28d9'}
                    onChange={(event) => setThemeColor(event.target.value)}
                    aria-label="Theme color"
                    className="h-11 w-16 cursor-pointer rounded border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <input
                    value={themeColor}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(value)) setThemeColor(value);
                    }}
                    onBlur={() => {
                      if (!/^#[0-9a-fA-F]{6}$/.test(themeColor)) setThemeColor('#6d28d9');
                    }}
                    aria-label="Theme color hex value"
                    className={`${smallInputClass} font-mono uppercase`}
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-semibold">How it works</p>
              <ol className="mt-2 list-inside list-decimal space-y-2 text-xs leading-5">
                <li>AI understands your brief and the number of supplied images.</li>
                <li>It searches your {templateCount || 'available'} fillable templates privately.</li>
                <li>It fills the matching text and image slots and opens the result on the canvas.</li>
                <li>If it is not right, Try another design searches again without showing a template picker.</li>
              </ol>
            </div>
          </section>
        </div>

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || preparingImages}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={submitting || preparingImages || brief.trim().length < 10}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Finding and creating your poster…' : 'Create my poster'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';
const smallInputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';

function readableFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function messageFromError(error: unknown): string {
  if (error instanceof TemplatePosterError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The poster could not be generated.';
}
