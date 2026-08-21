import { useState } from 'react';
import type {
  PosterReconstructionPlan,
  PosterReconstructionSource,
} from '../../../shared/ai/posterReconstruction';
import {
  compilePosterReconstruction,
  type CompiledPosterReconstruction,
  type ReconstructionImageReplacement,
} from '../ai/compilePosterReconstruction';
import { prepareTemplateReference, type PreparedPosterImage } from '../ai/preparePosterImage';
import {
  PosterReconstructionError,
  requestPosterReconstruction,
} from '../services/posterReconstructionApi';
import {
  downloadStockPhoto,
  searchStockPhotos,
  StockPhotoError,
  type StockPhotoCandidate,
} from '../services/stockPhotosApi';

interface TemplateCreatorWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (
    compiled: CompiledPosterReconstruction,
    meta: { source: PosterReconstructionSource; model: string | null },
  ) => void;
}

export function TemplateCreatorWizard({ open, onClose, onApply }: TemplateCreatorWizardProps) {
  const [reference, setReference] = useState<PreparedPosterImage | null>(null);
  const [guideOpacity, setGuideOpacity] = useState(0.22);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    plan: PosterReconstructionPlan;
    source: PosterReconstructionSource;
    model: string | null;
  } | null>(null);
  const [candidates, setCandidates] = useState<Record<string, StockPhotoCandidate[]>>({});
  const [replacementMessages, setReplacementMessages] = useState<Record<string, string>>({});
  const [replacements, setReplacements] = useState<Record<string, ReconstructionImageReplacement>>({});
  const [preparingReplacement, setPreparingReplacement] = useState<string | null>(null);

  if (!open) return null;

  const handleReference = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAnalysis(null);
    setCandidates({});
    setReplacementMessages({});
    setReplacements({});
    setPreparing(true);
    try {
      setReference(await prepareTemplateReference(file));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparing(false);
    }
  };

  const compileAndApply = async (current: {
    plan: PosterReconstructionPlan;
    source: PosterReconstructionSource;
    model: string | null;
  }) => {
    if (!reference) return;
    const compiled = await compilePosterReconstruction({
      plan: current.plan,
      reference,
      referenceGuideOpacity: guideOpacity,
      imageReplacements: replacements,
    });
    onApply(compiled, { source: current.source, model: current.model });
    onClose();
  };

  const loadStockSuggestions = async (plan: PosterReconstructionPlan) => {
    const replaceablePhotos = replacementItems(plan).filter((item) =>
      ['photo', 'background_photo'].includes(item.imageRole) && item.imageSearchQuery.trim(),
    );
    setReplacementMessages(Object.fromEntries(replaceablePhotos.map((item) => [item.key, 'Searching Pexels…'])));
    await Promise.all(replaceablePhotos.map(async (item) => {
      try {
        const photos = await searchStockPhotos({
          query: item.imageSearchQuery.trim(),
          orientation: orientationFor(item.box.width / item.box.height),
          color: item.imageDominantColor,
        });
        setCandidates((current) => ({ ...current, [item.key]: photos }));
        setReplacementMessages((current) => ({
          ...current,
          [item.key]: photos.length === 0
            ? 'No matching stock photos were found. Upload your own image or use the placeholder.'
            : '',
        }));
      } catch (caught) {
        const message = caught instanceof StockPhotoError && caught.code === 'STOCK_PHOTOS_NOT_CONFIGURED'
          ? 'Pexels is not configured. Upload your own image or use the clean placeholder.'
          : messageFromError(caught);
        setReplacementMessages((current) => ({ ...current, [item.key]: message }));
      }
    }));
  };

  const handleCreate = async () => {
    if (!reference) {
      setError('Upload a flat poster first.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (analysis) {
        await compileAndApply(analysis);
        return;
      }
      const response = await requestPosterReconstruction({
          reference: {
            dataUrl: reference.dataUrl,
            width: reference.width,
            height: reference.height,
          },
          quality: 'quality',
        });
      const current = { plan: response.plan, source: response.source, model: response.model };
      if (replacementItems(response.plan).length === 0) {
        await compileAndApply(current);
        return;
      }
      setAnalysis(current);
      void loadStockSuggestions(response.plan);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplacementUpload = async (key: string, file: File | undefined) => {
    if (!file) return;
    setPreparingReplacement(key);
    setError(null);
    try {
      const prepared = await prepareTemplateReference(file);
      setReplacements((current) => ({
        ...current,
        [key]: { src: prepared.dataUrl, width: prepared.width, height: prepared.height },
      }));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparingReplacement(null);
    }
  };

  const handleStockPick = async (key: string, photo: StockPhotoCandidate) => {
    setPreparingReplacement(key);
    setError(null);
    try {
      const prepared = await downloadStockPhoto(photo);
      setReplacements((current) => ({
        ...current,
        [key]: {
          src: prepared.dataUrl,
          width: prepared.width,
          height: prepared.height,
          credit: `Photo by ${photo.photographer} on Pexels`,
        },
      }));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparingReplacement(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-creator-title"
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 id="template-creator-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
              Create a template from a flat poster
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              AI reconstructs editable text, basic shapes, and image regions. You polish the draft,
              confirm the fillable fields, then save it to your template library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="ml-4 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_0.9fr]">
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">1. Upload the reference</h3>
            <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-violet-400 bg-violet-50/60 p-3 text-sm text-violet-900 hover:bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200">
              <span className="font-medium">
                {preparing
                  ? 'Preparing poster…'
                  : reference
                    ? `Reference: ${reference.fileName}`
                    : 'Choose a PNG, JPEG, or WebP poster'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={preparing || submitting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void handleReference(file);
                }}
              />
            </label>
            {reference && (
              <img
                src={reference.dataUrl}
                alt="Template reconstruction reference"
                className="mt-3 max-h-[55vh] w-full rounded-xl bg-zinc-100 object-contain dark:bg-zinc-950"
              />
            )}
          </section>

          <section className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">2. Tracing guide</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                The original poster is placed behind the reconstructed layers as a locked guide.
                Replace or delete it before publishing so old names and photographs do not remain.
              </p>
              <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Guide opacity: {Math.round(guideOpacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.02"
                  value={guideOpacity}
                  onChange={(event) => setGuideOpacity(Number(event.target.value))}
                  className="mt-2 w-full accent-violet-600"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
              <p className="font-semibold text-zinc-800 dark:text-zinc-100">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>The editable draft opens in the canvas.</li>
                <li>Likely titles, dates, names, and photos are labeled automatically.</li>
                <li>Correct fonts, crops, backgrounds, and any missed decoration.</li>
                <li>Click text or image layers to add or correct template fields.</li>
                <li>Save the finished template to the cloud library.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              This first version makes a strong starting draft, not a pixel-perfect layered source.
              Complex backgrounds and overlapping artwork still need manual correction.
            </div>
          </section>
        </div>

        {analysis && (
          <section className="max-h-[48vh] overflow-y-auto border-t border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950/40">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">3. Review unsafe image crops</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                These regions contain overlapping poster artwork or incomplete subjects. Choose a clean replacement,
                upload one, or continue with a clearly labeled placeholder. The contaminated crop will not be inserted.
              </p>
            </div>
            <div className="space-y-4">
              {replacementItems(analysis.plan).map((item) => {
                const selected = replacements[item.key];
                const stock = candidates[item.key] ?? [];
                return (
                  <div key={item.key} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{item.label}</p>
                        <p className="mt-1 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
                          {item.replacementReason || 'The original region is unsafe to crop cleanly.'}
                        </p>
                        {item.imageSearchQuery && (
                          <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">Search: {item.imageSearchQuery}</p>
                        )}
                      </div>
                      <label className="cursor-pointer rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">
                        {preparingReplacement === item.key ? 'Preparing…' : 'Upload replacement'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={Boolean(preparingReplacement) || submitting}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            void handleReplacementUpload(item.key, file);
                          }}
                        />
                      </label>
                    </div>

                    {selected && (
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                        <img
                          src={selected.src}
                          alt="Selected clean replacement"
                          className={`h-16 w-20 rounded ${
                            item.imageRole === 'person'
                              ? 'bg-zinc-100 object-contain dark:bg-zinc-800'
                              : 'object-cover'
                          }`}
                        />
                        <div className="min-w-0 flex-1 text-xs text-emerald-900 dark:text-emerald-200">
                          <p className="font-semibold">Clean replacement selected</p>
                          {selected.credit && <p className="mt-1 truncate">{selected.credit}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplacements((current) => {
                            const next = { ...current };
                            delete next[item.key];
                            return next;
                          })}
                          className="rounded px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                        >
                          Use placeholder
                        </button>
                      </div>
                    )}

                    {!selected && replacementMessages[item.key] && (
                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{replacementMessages[item.key]}</p>
                    )}

                    {!selected && stock.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {stock.map((photo) => (
                          <div key={photo.id} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                            <button
                              type="button"
                              onClick={() => void handleStockPick(item.key, photo)}
                              disabled={Boolean(preparingReplacement) || submitting}
                              className="block w-full disabled:opacity-50"
                              title={photo.alt || `Photo by ${photo.photographer}`}
                            >
                              <img src={photo.thumbnailUrl} alt={photo.alt || item.imageSearchQuery} className="h-24 w-full object-cover" />
                            </button>
                            <p className="truncate px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                              Photo by{' '}
                              <a href={photo.photographerUrl} target="_blank" rel="noreferrer" className="underline">{photo.photographer}</a>
                              {' '}on <a href={photo.pexelsUrl} target="_blank" rel="noreferrer" className="underline">Pexels</a>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!reference || preparing || submitting || Boolean(preparingReplacement)}
              className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? analysis ? 'Creating editable draft…' : 'Analyzing poster…'
                : analysis ? 'Create draft with these replacements' : 'Analyze and create editable draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function messageFromError(error: unknown): string {
  if (error instanceof PosterReconstructionError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The template draft could not be created.';
}

function replacementItems(plan: PosterReconstructionPlan) {
  return plan.elements.filter((item) => item.kind === 'image_region' && item.replacementRecommended);
}

function orientationFor(aspect: number): 'landscape' | 'portrait' | 'square' {
  if (aspect > 1.15) return 'landscape';
  if (aspect < 0.87) return 'portrait';
  return 'square';
}
