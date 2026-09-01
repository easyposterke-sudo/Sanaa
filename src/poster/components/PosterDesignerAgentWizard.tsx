import { useEffect, useState } from 'react';
import type { PosterDesignerReview } from '../../../shared/ai/posterDesignerAgent';
import { applyTemplateTheme } from '../ai/applyTemplateTheme';
import {
  applyPosterDesignerOperations,
  collectPosterDesignerElementSummaries,
  stabilizePosterDesignerLayout,
  validatePosterDesignerLayout,
} from '../ai/posterDesignerAgentTools';
import {
  buildTemplatePosterCatalogFields,
  buildTemplatePosterExistingText,
} from '../ai/templateFieldCatalog';
import { capturePosterThumbnail } from '../canvasRef';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { usePosterTemplateCategories } from '../hooks/usePosterTemplateCategories';
import { preparePortrait, type PreparedPosterImage } from '../ai/preparePosterImage';
import { findPosterTemplateById, getAllPosterTemplates } from '../posterTemplateList';
import {
  PosterDesignerAgentError,
  reviewPosterDesignerDraft,
  startPosterDesignerAgent,
} from '../services/posterDesignerAgentApi';
import { fetchPosterTemplateById } from '../services/posterTemplatesApi';
import { usePosterStore } from '../store/posterStore';
import { instantiateTemplate } from '../templateMerge';
import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterProject } from '../types';

type GeneratedAgentPoster = {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
};

interface PosterDesignerAgentWizardProps {
  open: boolean;
  onClose: () => void;
  onApply: (generated: GeneratedAgentPoster) => void;
}

type AgentStage = 'idle' | 'planning' | 'building' | 'inspecting' | 'revising' | 'complete';

interface BriefImage {
  id: string;
  name: string;
  role: string;
  asset: PreparedPosterImage;
}

interface AgentResult {
  templateName: string;
  concept: string;
  source: 'openai' | 'fallback';
  reviewSource: 'openai' | 'fallback' | null;
  review: PosterDesignerReview | null;
  visualReviewRequested: boolean;
  visualInspectionUsed: boolean;
  deterministicIssueCount: number;
  revisionPasses: number;
  safetyAdjustments: number;
  layoutSkillVersion: string;
  appliedOperations: number;
  skippedOperations: number;
}

export function PosterDesignerAgentWizard({ open, onClose, onApply }: PosterDesignerAgentWizardProps) {
  useModalScrollLock(open);
  const { categories, loading: categoriesLoading } = usePosterTemplateCategories();
  const [brief, setBrief] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [images, setImages] = useState<BriefImage[]>([]);
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [themeColor, setThemeColor] = useState('#6d28d9');
  const [visualReview, setVisualReview] = useState(true);
  const [preparingImages, setPreparingImages] = useState(false);
  const [stage, setStage] = useState<AgentStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);

  const busy = stage !== 'idle' && stage !== 'complete';
  const templates = getAllPosterTemplates().filter(
    (template) =>
      (template.fields?.length ?? 0) > 0 &&
      (!categoryId || template.category === categoryId),
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setStage('idle');
  }, [open]);

  if (!open) return null;

  const handleImages = async (files: readonly File[]) => {
    if (files.length === 0) return;
    const selected = files.slice(0, Math.max(0, 8 - images.length));
    if (selected.length === 0) {
      setError('You can add up to 8 images.');
      return;
    }
    setPreparingImages(true);
    setError(null);
    try {
      const prepared = await Promise.all(selected.map(async (file) => ({
        id: crypto.randomUUID(),
        name: readableFileName(file.name),
        role: '',
        asset: await preparePortrait(file),
      })));
      setImages((current) => [...current, ...prepared]);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparingImages(false);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setResult(null);
    if (brief.trim().length < 10) {
      setError('Describe the poster and the information that must appear.');
      return;
    }
    if (templates.length === 0) {
      setError(categoryId
        ? 'No fillable templates are assigned to this category yet.'
        : 'Create and label at least one template before testing the agent.');
      return;
    }
    if (themeEnabled && !/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
      setError('Choose a valid six-digit theme colour.');
      return;
    }

    const sessionId = crypto.randomUUID();
    setStage('planning');
    try {
      const response = await startPosterDesignerAgent({
        sessionId,
        brief: brief.trim(),
        categoryId: categoryId || null,
        themeColor: themeEnabled ? themeColor : null,
        images: images.map((image, index) => ({
          index,
          name: image.name.trim(),
          role: image.role.trim(),
        })),
        templates: templates.slice(0, 100).map((template, index) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          description: template.description ?? '',
          fields: buildTemplatePosterCatalogFields(template),
          existingText: buildTemplatePosterExistingText(template),
          preview: visualReview && index < 8 ? templatePreview(template) : null,
        })),
        excludedTemplateIds: [],
        maxRevisions: 4,
      });

      setStage('building');
      const selectedTemplate =
        findPosterTemplateById(response.plan.templateId) ??
        (await fetchPosterTemplateById(response.plan.templateId));
      const values: Record<string, string> = {};
      for (const field of selectedTemplate.fields ?? []) {
        if ((field.kind ?? 'text') === 'text') values[field.key] = '';
      }
      for (const field of response.plan.fields) {
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
      const themedProject = themeEnabled
        ? applyTemplateTheme(instantiated.project, themeColor)
        : instantiated.project;
      const initialTools = applyPosterDesignerOperations(
        themedProject,
        instantiated.fieldBindings,
        response.plan.operations,
      );
      onApply({ project: initialTools.project, fieldBindings: initialTools.fieldBindings });
      let appliedOperations = initialTools.appliedOperationIds.length;
      let skippedOperations = initialTools.skipped.length;
      let revisionPasses = 0;
      let deterministicIssueCount = 0;
      let latestReview: PosterDesignerReview | null = null;
      let latestReviewSource: 'openai' | 'fallback' | null = null;
      let visualInspectionUsed = false;
      const layoutAdjustedElementIds = new Set<string>();
      let workingBindings = initialTools.fieldBindings;
      let latestSummaries: ReturnType<typeof collectPosterDesignerElementSummaries> = [];

      // Three genuine correction passes followed by a fourth inspection-only pass.
      for (let iteration = 1; iteration <= 4; iteration += 1) {
        setStage('inspecting');
        await waitForCanvasRender();
        let renderedProject = usePosterStore.getState().getProject();
        let summaries = collectPosterDesignerElementSummaries(renderedProject, workingBindings);
        const alignmentPass = stabilizePosterDesignerLayout(renderedProject, summaries);
        if (alignmentPass.adjustedElementIds.length > 0) {
          alignmentPass.adjustedElementIds.forEach((id) => layoutAdjustedElementIds.add(id));
          onApply({ project: alignmentPass.project, fieldBindings: workingBindings });
          await waitForCanvasRender();
          renderedProject = usePosterStore.getState().getProject();
          summaries = collectPosterDesignerElementSummaries(renderedProject, workingBindings);
        }
        latestSummaries = summaries;
        const issues = validatePosterDesignerLayout(
          renderedProject,
          summaries,
          response.plan.expectedFacts,
        );
        deterministicIssueCount = issues.length;
        const previewDataUrl = visualReview
          ? await capturePosterThumbnail(
              renderedProject.canvasWidth,
              renderedProject.canvasHeight,
              renderedProject.canvasBackground ?? {
                type: 'solid',
                color: renderedProject.canvasBackgroundColor ?? '#ffffff',
              },
            )
          : null;
        const reviewResponse = await reviewPosterDesignerDraft({
          sessionId,
          iteration,
          elements: summaries,
          issues,
          preview: previewDataUrl
            ? previewMetadata(previewDataUrl, renderedProject.canvasWidth, renderedProject.canvasHeight)
            : null,
        });
        latestReview = reviewResponse.review;
        latestReviewSource = reviewResponse.source;
        visualInspectionUsed ||= Boolean(previewDataUrl);
        const isFinalInspection = iteration === 4;
        if (
          isFinalInspection ||
          reviewResponse.review.operations.length === 0 ||
          reviewResponse.review.stopReason === 'quality_passed'
        ) {
          break;
        }

        setStage('revising');
        const latestProject = usePosterStore.getState().getProject();
        const revised = applyPosterDesignerOperations(
          latestProject,
          workingBindings,
          reviewResponse.review.operations,
        );
        appliedOperations += revised.appliedOperationIds.length;
        skippedOperations += revised.skipped.length;
        if (revised.appliedOperationIds.length === 0) break;
        revisionPasses += 1;
        workingBindings = revised.fieldBindings;
        onApply({ project: revised.project, fieldBindings: revised.fieldBindings });
        await waitForCanvasRender();
      }

      const stabilization = stabilizePosterDesignerLayout(
        usePosterStore.getState().getProject(),
        latestSummaries,
      );
      if (stabilization.adjustedElementIds.length > 0) {
        stabilization.adjustedElementIds.forEach((id) => layoutAdjustedElementIds.add(id));
        onApply({ project: stabilization.project, fieldBindings: workingBindings });
        await waitForCanvasRender();
        const finalProject = usePosterStore.getState().getProject();
        const finalSummaries = collectPosterDesignerElementSummaries(finalProject, workingBindings);
        deterministicIssueCount = validatePosterDesignerLayout(
          finalProject,
          finalSummaries,
          response.plan.expectedFacts,
        ).length;
      }

      setResult({
        templateName: selectedTemplate.name,
        concept: response.plan.concept,
        source: response.source,
        reviewSource: latestReviewSource,
        review: latestReview,
        visualReviewRequested: visualReview,
        visualInspectionUsed,
        deterministicIssueCount,
        revisionPasses,
        safetyAdjustments: layoutAdjustedElementIds.size,
        layoutSkillVersion: stabilization.skillVersion,
        appliedOperations,
        skippedOperations,
      });
      setStage('complete');
    } catch (caught) {
      setError(messageFromError(caught));
      setStage('idle');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden overscroll-none bg-black/70 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-designer-agent-title"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-cyan-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl dark:border-cyan-900 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-700">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="poster-designer-agent-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
                Agent Designer Lab
              </h2>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                Experimental
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              The agent may adapt a template, understand unlabeled visible copy, inspect the rendered draft, and make up to three bounded visual corrections.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || preparingImages}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-y-contain p-4 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-5">
            <div>
              <label htmlFor="agent-poster-category" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Poster category <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <select
                id="agent-poster-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={busy || categoriesLoading}
                className={inputClass}
              >
                <option value="">Let the agent decide</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {templates.length} fillable template{templates.length === 1 ? '' : 's'} available to this experiment.
              </p>
            </div>

            <div>
              <label htmlFor="agent-poster-brief" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Describe the poster and all information that must appear
              </label>
              <textarea
                id="agent-poster-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                disabled={busy}
                rows={9}
                maxLength={4_000}
                placeholder="Example: Grace Chapel Sunday Worship, 20 September at 10:00 AM. Theme: Arise and Worship. Venue: Main Sanctuary. Guest minister: John Kamau…"
                className={`${inputClass} resize-y`}
              />
              <div className="mt-1 text-right text-xs text-zinc-400">{brief.length}/4000</div>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">People or guest images</h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Optional; originals remain in the browser.</p>
                </div>
                <label className="cursor-pointer rounded-lg border border-cyan-500 px-3 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30">
                  {preparingImages ? 'Preparing…' : 'Add images'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    disabled={busy || preparingImages || images.length >= 8}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const files = Array.from(input.files ?? []);
                      input.value = '';
                      void handleImages(files);
                    }}
                  />
                </label>
              </div>
              {images.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {images.map((image) => (
                    <div key={image.id} className="flex gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                      <img src={image.asset.dataUrl} alt="Uploaded person" className="h-20 w-20 rounded-md bg-zinc-100 object-contain dark:bg-zinc-950" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          value={image.name}
                          onChange={(event) => setImages((current) => current.map((item) => item.id === image.id ? { ...item, name: event.target.value } : item))}
                          placeholder="Name"
                          aria-label="Name for uploaded image"
                          className={smallInputClass}
                        />
                        <input
                          value={image.role}
                          onChange={(event) => setImages((current) => current.map((item) => item.id === image.id ? { ...item, role: event.target.value } : item))}
                          placeholder="Host, guest, speaker…"
                          aria-label="Role for uploaded image"
                          className={smallInputClass}
                        />
                        <button type="button" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} className="text-xs text-red-600 hover:underline dark:text-red-400">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={themeEnabled} onChange={(event) => setThemeEnabled(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 accent-cyan-600" />
                <span className="flex-1">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">Apply a theme colour</span>
                  <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">Uses the existing trusted template recolouring tool.</span>
                </span>
              </label>
              {themeEnabled && (
                <div className="mt-4 flex items-center gap-3">
                  <input type="color" value={themeColor} onChange={(event) => setThemeColor(event.target.value)} disabled={busy} className="h-10 w-14 rounded border border-zinc-300 p-1 dark:border-zinc-700" />
                  <input value={themeColor} onChange={(event) => setThemeColor(event.target.value)} disabled={busy} className={`${smallInputClass} font-mono uppercase`} />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={visualReview} onChange={(event) => setVisualReview(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 accent-cyan-600" />
                <span className="flex-1">
                  <span className="text-sm font-semibold text-cyan-950 dark:text-cyan-100">Let the agent inspect a preview</span>
                  <span className="mt-1 block text-xs leading-5 text-cyan-800 dark:text-cyan-300">
                    Small template previews and reduced WebP drafts, which may include supplied portraits and poster text, are sent privately to the configured AI service for visual planning and critique. Turn this off for metadata-and-geometry-only review.
                  </span>
                </span>
              </label>
            </div>

            <AgentProgress stage={stage} />

            {result && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-emerald-950 dark:text-emerald-100">Agent draft complete</h3>
                  {result.review && (
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-800 dark:bg-zinc-900 dark:text-emerald-200">
                      {result.review.score}/100
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-900 dark:text-emerald-200">{result.concept}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                  <div><dt className="font-semibold">Base design</dt><dd>{result.templateName}</dd></div>
                  <div><dt className="font-semibold">Agent tools</dt><dd>{result.appliedOperations} applied</dd></div>
                  <div><dt className="font-semibold">Final checks</dt><dd>{result.deterministicIssueCount} issue{result.deterministicIssueCount === 1 ? '' : 's'}</dd></div>
                  <div><dt className="font-semibold">Corrections</dt><dd>{result.revisionPasses} pass{result.revisionPasses === 1 ? '' : 'es'}</dd></div>
                  <div><dt className="font-semibold">Layout skill</dt><dd>{result.safetyAdjustments} anchored · {result.layoutSkillVersion}</dd></div>
                  <div><dt className="font-semibold">Planner</dt><dd>{result.source === 'openai' ? 'AI' : 'safe fallback'}</dd></div>
                  <div><dt className="font-semibold">Critic</dt><dd>{result.reviewSource === 'openai' ? 'AI visual critic' : 'safe fallback'}</dd></div>
                </dl>
                {result.review && <p className="mt-3 text-xs leading-5">{result.review.summary}</p>}
                {result.visualReviewRequested && !result.visualInspectionUsed && (
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    The canvas could not be captured, so this run used geometry-only inspection.
                  </p>
                )}
                {result.skippedOperations > 0 && <p className="mt-2 text-xs">{result.skippedOperations} unsafe or invalid operation{result.skippedOperations === 1 ? ' was' : 's were'} skipped.</p>}
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}
          </section>
        </div>

        <div className="grid shrink-0 gap-2 border-t border-zinc-200 p-4 sm:flex sm:justify-end sm:px-6 dark:border-zinc-700">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            {result ? 'Use this poster' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || preparingImages || brief.trim().length < 10}
            className="rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? stageLabel(stage) : result ? 'Generate another agent draft' : 'Start Agent Designer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentProgress({ stage }: { stage: AgentStage }) {
  const steps: Array<{ id: AgentStage; label: string }> = [
    { id: 'planning', label: 'Interpret and plan' },
    { id: 'building', label: 'Use editor tools' },
    { id: 'inspecting', label: 'Render and inspect' },
    { id: 'revising', label: 'Apply bounded revision' },
  ];
  const current = steps.findIndex((step) => step.id === stage);
  const complete = stage === 'complete';
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700" aria-live="polite">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Agent run</h3>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => {
          const done = complete || (current >= 0 && index < current);
          const active = step.id === stage;
          return (
            <li key={step.id} className={`flex items-center gap-2 text-xs ${active ? 'font-semibold text-cyan-700 dark:text-cyan-300' : done ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-400'}`}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current">{done ? '✓' : index + 1}</span>
              {step.label}{active ? '…' : ''}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

async function waitForCanvasRender(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise<void>((resolve) => setTimeout(resolve, 350));
}

function previewMetadata(dataUrl: string, canvasWidth: number, canvasHeight: number) {
  const width = Math.max(64, Math.min(400, Math.round(canvasWidth)));
  const height = Math.max(64, Math.min(1_600, Math.round((canvasHeight / canvasWidth) * width)));
  return { dataUrl, width, height };
}

function templatePreview(template: PosterTemplateDefinition) {
  const dataUrl = template.thumbnail;
  if (!dataUrl?.startsWith('data:image/') || dataUrl.length > 300_000) return null;
  const width = Math.max(64, Math.min(400, Math.round(template.project.canvasWidth)));
  const height = Math.max(
    64,
    Math.min(1_600, Math.round((template.project.canvasHeight / template.project.canvasWidth) * width)),
  );
  return { dataUrl, width, height };
}

function stageLabel(stage: AgentStage): string {
  switch (stage) {
    case 'planning': return 'Planning…';
    case 'building': return 'Building draft…';
    case 'inspecting': return 'Inspecting draft…';
    case 'revising': return 'Revising draft…';
    default: return 'Working…';
  }
}

function readableFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function messageFromError(error: unknown): string {
  if (error instanceof PosterDesignerAgentError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The agent could not complete this poster.';
}

const inputClass = 'mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';
const smallInputClass = 'w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-cyan-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';
