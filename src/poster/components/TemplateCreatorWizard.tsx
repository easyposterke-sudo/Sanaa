import { useEffect, useState } from 'react';
import { PosterPromptCreator } from './PosterPromptCreator';
import { PosterAssetCropDialog } from './PosterAssetCropDialog';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { MAX_RECONSTRUCTION_ELEMENTS } from '../../../shared/ai/posterReconstruction';
import type {
  PosterReconstructionPlan,
  PosterReconstructionSource,
  ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import type { NormalizedCrop } from '../ai/cropPosterAsset';
import {
  compilePosterReconstruction,
  type CompiledPosterReconstruction,
  type ReconstructionImageReplacement,
} from '../ai/compilePosterReconstruction';
import { prepareLogoImage, prepareTemplateReference, type PreparedPosterImage } from '../ai/preparePosterImage';
import { prepareReconstructionFontCatalog } from '../ai/prepareReconstructionFontCatalog';
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
import {
  EDITABLE_POSTER_CANVAS_SIZE_PRESETS,
  normalizeTemplateCanvasDimension,
  recommendTemplateCanvasSize,
  TEMPLATE_CANVAS_SIZE_PRESETS,
} from '../templateCanvasSize';

interface CanvasSizeSelection {
  id: string;
  width: number;
  height: number;
}

const NEW_LOGO_CROP_KEY = '__new_logo__';
type ReconstructionPhase = 'preparing' | 'analyzing' | 'building';

interface TemplateCreatorWizardProps {
  referenceOnly?: boolean;
  initialReference?: PreparedPosterImage | null;
  initialCanvasSize?: CanvasSizeSelection | null;
  open: boolean;
  onClose: () => void;
  mode?: 'template' | 'poster';
  onApply: (
    compiled: CompiledPosterReconstruction,
    meta: { source: PosterReconstructionSource; model: string | null },
  ) => void;
}

export function TemplateCreatorWizard({ open, onClose, mode = 'template', referenceOnly = false, initialReference = null, initialCanvasSize = null, onApply }: TemplateCreatorWizardProps) {
  useModalScrollLock(open);
  const [reference, setReference] = useState<PreparedPosterImage | null>(initialReference);
  const [importExisting, setImportExisting] = useState(false);
  const [canvasSize, setCanvasSize] = useState<CanvasSizeSelection | null>(initialCanvasSize);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [guideOpacity, setGuideOpacity] = useState(0.22);
  const [includeReferenceGuide, setIncludeReferenceGuide] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ReconstructionPhase | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [phaseElapsedSeconds, setPhaseElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    plan: PosterReconstructionPlan;
    source: PosterReconstructionSource;
    model: string | null;
    fontFamilies: Readonly<Record<string, string>>;
  } | null>(null);
  const [candidates, setCandidates] = useState<Record<string, StockPhotoCandidate[]>>({});
  const [replacementMessages, setReplacementMessages] = useState<Record<string, string>>({});
  const [replacements, setReplacements] = useState<Record<string, ReconstructionImageReplacement>>({});
  const [omittedImages, setOmittedImages] = useState<string[]>([]);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [cropItemKey, setCropItemKey] = useState<string | null>(null);
  const [preparingReplacement, setPreparingReplacement] = useState<string | null>(null);
  const [freshGeneration, setFreshGeneration] = useState(Boolean(initialReference));

  useEffect(() => {
    if (!processingPhase || phaseStartedAt === null) return;
    const interval = window.setInterval(() => {
      setPhaseElapsedSeconds(Math.floor((Date.now() - phaseStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [processingPhase, phaseStartedAt]);

  const beginPhase = (phase: ReconstructionPhase) => {
    setProcessingPhase(phase);
    setPhaseStartedAt(Date.now());
    setPhaseElapsedSeconds(0);
  };

  if (!open) return null;
  if (mode === 'poster' && !referenceOnly && !importExisting) return <PosterPromptCreator onClose={onClose} onImport={() => setImportExisting(true)} onApply={draft => onApply(draft, { source: 'openai', model: null })} />;

  const creatingPoster = mode === 'poster';
  const canvasSizePresets = creatingPoster
    ? EDITABLE_POSTER_CANVAS_SIZE_PRESETS
    : TEMPLATE_CANVAS_SIZE_PRESETS;

  const recommendedPreset = reference
    ? recommendTemplateCanvasSize(reference.sourceWidth, reference.sourceHeight, canvasSizePresets)
    : null;
  const originalCanvasSize = reference
    ? {
        width: normalizeTemplateCanvasDimension(reference.sourceWidth, reference.width),
        height: normalizeTemplateCanvasDimension(reference.sourceHeight, reference.height),
      }
    : null;

  const handleReference = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAnalysis(null);
    setCanvasSize(null);
    setCandidates({});
    setReplacementMessages({});
    setReplacements({});
    setOmittedImages([]);
    setSearchQueries({});
    setCropItemKey(null);
    setIncludeReferenceGuide(true);
    setPreparing(true);
    try {
      const prepared = await prepareTemplateReference(file);
      const recommended = recommendTemplateCanvasSize(
        prepared.sourceWidth,
        prepared.sourceHeight,
        canvasSizePresets,
      );
      setReference(prepared);
      setCanvasSize({
        id: recommended.id,
        width: recommended.width,
        height: recommended.height,
      });
      setCustomWidth(String(recommended.width));
      setCustomHeight(String(recommended.height));
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
    fontFamilies: Readonly<Record<string, string>>;
  }) => {
    if (!reference || !canvasSize) return;
    const undecidedLogo = current.plan.elements.find((item) =>
      item.kind === 'image_region' && item.imageRole === 'logo' &&
      !replacements[item.key] && !omittedImages.includes(item.key),
    );
    if (undecidedLogo) {
      setError(`Choose Upload, Crop from poster, or Leave out for “${undecidedLogo.label}”.`);
      return;
    }
    const compiled = await compilePosterReconstruction({
      plan: current.plan,
      reference,
      canvasSize,
      referenceGuideOpacity: creatingPoster && !includeReferenceGuide ? 0 : guideOpacity,
      imageReplacements: replacements,
      omittedImageKeys: omittedImages,
      fontCatalogFamilies: current.fontFamilies,
      layoutMode: 'reference',
    });
    onApply(compiled, { source: current.source, model: current.model });
    onClose();
  };

  const searchForItem = async (item: PosterReconstructionPlan['elements'][number], query: string) => {
    const search = query.trim();
    if (search.length < 2) {
      setReplacementMessages((current) => ({ ...current, [item.key]: 'Enter at least two search characters.' }));
      return;
    }
    setReplacementMessages((current) => ({ ...current, [item.key]: 'Searching Pexels…' }));
    setCandidates((current) => ({ ...current, [item.key]: [] }));
    try {
      const photos = await searchStockPhotos({ query: search });
      setCandidates((current) => ({ ...current, [item.key]: photos }));
      setReplacementMessages((current) => ({
        ...current,
        [item.key]: photos.length ? '' : 'No matching Pexels photos found. Try a shorter search or upload an image.',
      }));
    } catch (caught) {
      const message = caught instanceof StockPhotoError && caught.code === 'STOCK_PHOTOS_NOT_CONFIGURED'
        ? 'Pexels is not configured. You can still upload or crop an image.'
        : messageFromError(caught);
      setReplacementMessages((current) => ({ ...current, [item.key]: message }));
    }
  };

  const loadStockSuggestions = async (plan: PosterReconstructionPlan) => {
    const searchable = replacementItems(plan).filter((item) => item.imageRole !== 'logo' && item.imageSearchQuery.trim());
    await Promise.all(searchable.map((item) => searchForItem(item, item.imageSearchQuery)));
  };

  const handleCreate = async (forceFresh = false) => {
    if (!reference) {
      setError('Upload a flat poster first.');
      return;
    }
    if (!canvasSize) {
      setError('Choose the final poster size before creating the draft.');
      return;
    }
    setError(null);
    setSubmitting(true);
    beginPhase(analysis && !forceFresh ? 'building' : 'preparing');
    try {
      if (analysis && !forceFresh) {
        await compileAndApply(analysis);
        return;
      }
      if (forceFresh) {
        setCandidates({});
        setReplacementMessages({});
        setReplacements({});
        setOmittedImages([]);
        setSearchQueries({});
        setCropItemKey(null);
      }
      const fontCatalog = await prepareReconstructionFontCatalog().catch(() => null);
      beginPhase('analyzing');
      const response = await requestPosterReconstruction({
          reference: {
            dataUrl: reference.dataUrl,
            width: reference.width,
            height: reference.height,
          },
          quality: 'quality',
          ...(freshGeneration || forceFresh ? { forceFresh: true } : {}),
          ...(fontCatalog ? { fontCatalog: fontCatalog.request } : {}),
        });
      const current = {
        plan: response.plan,
        source: response.source,
        model: response.model,
        fontFamilies: fontCatalog?.families ?? {},
      };
      setAnalysis(current);
      setFreshGeneration(false);
      setSearchQueries(Object.fromEntries(replacementItems(response.plan).map((item) => [item.key, item.imageSearchQuery])));
      void loadStockSuggestions(response.plan);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSubmitting(false);
      setProcessingPhase(null);
    }
  };

  const handleReplacementUpload = async (key: string, file: File | undefined) => {
    if (!file) return;
    setPreparingReplacement(key);
    setError(null);
    try {
      const isLogo = analysis?.plan.elements.some((item) => item.key === key && item.imageRole === 'logo');
      const prepared = isLogo ? await prepareLogoImage(file) : await prepareTemplateReference(file);
      setReplacements((current) => ({
        ...current,
        [key]: { src: prepared.dataUrl, width: prepared.width, height: prepared.height },
      }));
      setOmittedImages((current) => current.filter((item) => item !== key));
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
      setOmittedImages((current) => current.filter((item) => item !== key));
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setPreparingReplacement(null);
    }
  };

  const handleCropApplied = (replacement: ReconstructionImageReplacement, crop: NormalizedCrop) => {
    if (!analysis || !cropItemKey) return;
    if (cropItemKey === NEW_LOGO_CROP_KEY) {
      const base = analysis.plan.elements.find((item) => item.imageRole === 'logo') ?? analysis.plan.elements[0];
      if (!base || analysis.plan.elements.length >= MAX_RECONSTRUCTION_ELEMENTS) return;
      let number = 1;
      while (analysis.plan.elements.some((item) => item.key === `additional_logo_${number}`)) number++;
      const key = `additional_logo_${number}`;
      const logo: ReconstructionElement = {
        ...base,
        key,
        kind: 'image_region',
        label: `Additional logo ${number}`,
        box: crop,
        angle: 0,
        opacity: 1,
        zIndex: Math.min(200, Math.max(...analysis.plan.elements.map((item) => item.zIndex)) + 1),
        text: '',
        fill: null,
        stroke: null,
        imageRole: 'logo',
        imageMask: 'none',
        imageCutout: false,
        imageEdge: 'none',
        imageHasOverlays: false,
        replacementRecommended: false,
        replacementReason: '',
        imageSearchQuery: '',
        suggestedFieldKey: key,
        suggestedFieldLabel: `Additional logo ${number}`,
        confidence: 1,
      };
      setAnalysis((current) => current ? { ...current, plan: { ...current.plan, elements: [...current.plan.elements, logo] } } : current);
      setReplacements((current) => ({ ...current, [key]: replacement }));
    } else {
      setReplacements((current) => ({ ...current, [cropItemKey]: replacement }));
      setOmittedImages((current) => current.filter((key) => key !== cropItemKey));
      const selectedKey = cropItemKey;
      setAnalysis((current) => current ? {
        ...current,
        plan: {
          ...current.plan,
          elements: current.plan.elements.map((item) => item.key === selectedKey ? { ...item, box: crop, angle: 0 } : item),
        },
      } : current);
    }
    setCropItemKey(null);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden overscroll-none bg-black/65 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-reconstruction-title"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 dark:border-zinc-700">
          <div className="min-w-0">
            {creatingPoster && !referenceOnly && <button type="button" disabled={submitting} onClick={() => setImportExisting(false)} className="mb-2 text-sm text-violet-600 underline">Create from a prompt instead</button>}
            <h2 id="poster-reconstruction-title" className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-white">
              {creatingPoster ? 'Create an editable poster' : 'Create a template from a flat poster'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 sm:px-3 sm:py-2 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="grid gap-4 p-3 sm:p-5 md:grid-cols-[1.1fr_0.9fr] md:gap-6">
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
                alt="Poster reconstruction reference"
                className="mt-3 max-h-[42dvh] w-full rounded-xl bg-zinc-100 object-contain sm:max-h-[55vh] dark:bg-zinc-950"
              />
            )}
          </section>

          <section className="space-y-5">
            {!reference && (
              <div className="rounded-xl border border-dashed border-zinc-200 p-3 dark:border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  2. Choose the final poster size
                </h3>
              </div>
            )}
            {reference && recommendedPreset && originalCanvasSize && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  2. Choose the final poster size
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {canvasSizePresets.map((preset) => {
                    const selected = canvasSize?.id === preset.id;
                    const recommended = preset.id === recommendedPreset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setCanvasSize({
                            id: preset.id,
                            width: preset.width,
                            height: preset.height,
                          })
                        }
                        disabled={submitting}
                        className={`rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${
                          selected
                            ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/30'
                            : 'border-zinc-200 hover:border-violet-300 dark:border-zinc-700 dark:hover:border-violet-700'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-900 dark:text-white">
                          {preset.label}
                          {recommended && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              Recommended
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-violet-700 dark:text-violet-300">
                          {preset.width}×{preset.height}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  aria-pressed={canvasSize?.id === 'original'}
                  onClick={() =>
                    setCanvasSize({
                      id: 'original',
                      width: originalCanvasSize.width,
                      height: originalCanvasSize.height,
                    })
                  }
                  disabled={submitting}
                  className={`mt-2 w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
                    canvasSize?.id === 'original'
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                      : 'border-zinc-200 hover:border-violet-300 dark:border-zinc-700 dark:hover:border-violet-700'
                  }`}
                >
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    Keep uploaded dimensions — {originalCanvasSize.width}×{originalCanvasSize.height}
                  </span>
                  {(originalCanvasSize.width < recommendedPreset.width ||
                    originalCanvasSize.height < recommendedPreset.height) && (
                    <span className="mt-0.5 block text-amber-700 dark:text-amber-300">
                      This may produce a lower-resolution download.
                    </span>
                  )}
                </button>

                <div className="mt-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Custom size</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={64}
                      max={4096}
                      value={customWidth}
                      aria-label="Custom poster width"
                      onChange={(event) => setCustomWidth(event.target.value)}
                      className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <span className="text-xs text-zinc-400">×</span>
                    <input
                      type="number"
                      min={64}
                      max={4096}
                      value={customHeight}
                      aria-label="Custom poster height"
                      onChange={(event) => setCustomHeight(event.target.value)}
                      className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        const width = normalizeTemplateCanvasDimension(
                          Number(customWidth),
                          recommendedPreset.width,
                        );
                        const height = normalizeTemplateCanvasDimension(
                          Number(customHeight),
                          recommendedPreset.height,
                        );
                        setCustomWidth(String(width));
                        setCustomHeight(String(height));
                        setCanvasSize({ id: 'custom', width, height });
                      }}
                      className={`rounded px-3 py-1.5 text-xs font-semibold ${
                        canvasSize?.id === 'custom'
                          ? 'bg-violet-600 text-white'
                          : 'border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      Use
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                3. {creatingPoster ? 'Original reference' : 'Tracing guide'}
              </h3>
              {creatingPoster ? (
                <>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={includeReferenceGuide}
                      onChange={(event) => setIncludeReferenceGuide(event.target.checked)}
                      disabled={submitting}
                      className="mt-0.5 h-4 w-4 accent-sky-600"
                    />
                    <span>
                      <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                        Keep the original reference poster behind the editable layers
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {includeReferenceGuide
                          ? 'It will be added as a locked, non-exporting layer to help you compare the reconstruction.'
                          : 'It will not be included in the Layers panel.'}
                      </span>
                    </span>
                  </label>
                  {includeReferenceGuide && (
                    <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Reference opacity: {Math.round(guideOpacity * 100)}%
                      <input
                        type="range"
                        min="0.02"
                        max="0.6"
                        step="0.02"
                        value={guideOpacity}
                        onChange={(event) => setGuideOpacity(Number(event.target.value))}
                        className="mt-2 w-full accent-sky-600"
                        disabled={submitting}
                      />
                    </label>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

          </section>
        </div>

        {analysis && (
          <section className="border-t border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-700 dark:bg-zinc-950/40">
            <button type="button" disabled={submitting || Boolean(preparingReplacement)} onClick={() => void handleCreate(true)} className="mb-3 rounded-lg border border-violet-400 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300">
              Recreate again from scratch
            </button>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">4. Choose images for the editable draft</h3>
            </div>
            <div className="space-y-4">
              {replacementItems(analysis.plan).map((item) => {
                const selected = replacements[item.key];
                const stock = candidates[item.key] ?? [];
                const omitted = omittedImages.includes(item.key);
                return (
                  <div key={item.key} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{item.label}</p>
                      </div>
                      <label className="cursor-pointer rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">
                        {preparingReplacement === item.key ? 'Preparing…' : item.imageRole === 'logo' ? 'Upload logo' : 'Upload image'}
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

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.imageRole !== 'background_photo' && (
                        <button type="button" disabled={Boolean(preparingReplacement) || submitting} onClick={() => setCropItemKey(item.key)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Crop from poster</button>
                      )}
                      <button type="button" aria-pressed={omitted} disabled={Boolean(preparingReplacement) || submitting} onClick={() => {
                        setOmittedImages((current) => current.includes(item.key) ? current : [...current, item.key]);
                        setReplacements((current) => { const next = { ...current }; delete next[item.key]; return next; });
                      }} className={`rounded-lg border px-3 py-2 text-xs font-medium ${omitted ? 'border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200' : 'border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800'}`}>Leave out</button>
                      {omitted && item.imageRole !== 'logo' && <button type="button" onClick={() => setOmittedImages((current) => current.filter((key) => key !== item.key))} className="rounded-lg border px-3 py-2 text-xs">Use placeholder</button>}
                    </div>

                    {item.imageRole !== 'logo' && (
                      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void searchForItem(item, searchQueries[item.key] ?? ''); }}>
                        <input aria-label={`Pexels search for ${item.label}`} value={searchQueries[item.key] ?? ''} maxLength={120} onChange={(event) => setSearchQueries((current) => ({ ...current, [item.key]: event.target.value }))} placeholder="Describe the image, including key objects" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-800" />
                        <button type="submit" disabled={Boolean(preparingReplacement) || submitting} className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-700 dark:text-violet-300">Search Pexels</button>
                      </form>
                    )}


                    {selected && !omitted && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                        <img
                          src={selected.src}
                          alt="Selected clean replacement"
                          className={`h-16 w-20 rounded ${
                            item.imageRole === 'person' || item.imageRole === 'logo'
                              ? 'bg-zinc-100 object-contain dark:bg-zinc-800'
                              : 'object-cover'
                          }`}
                        />
                        <div className="min-w-0 flex-1 text-xs text-emerald-900 dark:text-emerald-200">
                          <p className="font-semibold">Image selected for this region</p>
                          {selected.credit && <p className="mt-1 truncate">{selected.credit}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplacements((current) => {
                            const next = { ...current };
                            delete next[item.key];
                            return next;
                          })}
                          className="ml-auto rounded px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                        >
                          {item.imageRole === 'logo' ? 'Clear selection' : 'Use placeholder'}
                        </button>
                      </div>
                    )}

                    {!omitted && replacementMessages[item.key] && (
                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{replacementMessages[item.key]}</p>
                    )}

                    {!omitted && stock.length > 0 && (
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
              {analysis.plan.elements.length < MAX_RECONSTRUCTION_ELEMENTS && analysis.plan.elements.length > 0 && (
                <button type="button" onClick={() => setCropItemKey(NEW_LOGO_CROP_KEY)} className="w-full rounded-xl border border-dashed border-violet-400 px-3 py-3 text-left text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30">
                  Add a missing logo from the poster
                </button>
              )}
            </div>
          </section>
        )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 p-3 sm:px-5 sm:py-4 dark:border-zinc-700">
          {submitting && processingPhase && (
            <ReconstructionProgress phase={processingPhase} elapsedSeconds={phaseElapsedSeconds} />
          )}
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="grid gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 sm:w-auto dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!reference || !canvasSize || preparing || submitting || Boolean(preparingReplacement)}
              className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
            >
              {submitting
                ? analysis ? 'Creating editable draft…' : 'Analyzing poster…'
                : analysis ? 'Create draft with these replacements' : 'Analyze and create editable draft'}
            </button>
          </div>
        </div>
        {cropItemKey && reference && analysis && (() => {
          const item = cropItemKey === NEW_LOGO_CROP_KEY
            ? { ...analysis.plan.elements[0], label: 'Missing logo', imageRole: 'logo' as const, box: { x: 0.05, y: 0.8, width: 0.25, height: 0.15 } }
            : analysis.plan.elements.find((element) => element.key === cropItemKey);
          return item ? <PosterAssetCropDialog key={cropItemKey} reference={reference} item={item} onCancel={() => setCropItemKey(null)} onApply={handleCropApplied} /> : null;
        })()}
      </div>
    </div>
  );
}

function messageFromError(error: unknown): string {
  if (error instanceof PosterReconstructionError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The editable draft could not be created.';
}

function replacementItems(plan: PosterReconstructionPlan) {
  return plan.elements.filter((item) => item.kind === 'image_region' && !(item.imageRole === 'icon' && item.iconName !== 'none'));
}

function ReconstructionProgress({ phase, elapsedSeconds }: { phase: ReconstructionPhase; elapsedSeconds: number }) {
  const phases: ReconstructionPhase[] = ['preparing', 'analyzing', 'building'];
  const labels = ['Prepare fonts', 'Reconstruct layers', 'Review images & build'];
  const activeIndex = phases.indexOf(phase);
  const title = phase === 'preparing' ? 'Preparing the reference'
    : phase === 'analyzing' ? 'Reconstructing editable layers'
      : 'Building the editable draft';

  return (
    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <span className="text-xs tabular-nums text-sky-700 dark:text-sky-300" aria-live="off">
          Elapsed {formatElapsed(elapsedSeconds)}
        </span>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        {labels.map((label, index) => (
          <li key={label} aria-current={index === activeIndex ? 'step' : undefined} className={`rounded-md px-2 py-1.5 ${index < activeIndex
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
            : index === activeIndex
              ? 'bg-sky-200 font-semibold text-sky-900 dark:bg-sky-800 dark:text-sky-100'
              : 'bg-white/70 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400'}`}>
            {index < activeIndex ? '✓ ' : ''}{label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
