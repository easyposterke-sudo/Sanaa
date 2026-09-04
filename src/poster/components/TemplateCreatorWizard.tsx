import { useState } from 'react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
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
import {
  EDITABLE_POSTER_CANVAS_SIZE_PRESETS,
  normalizeTemplateCanvasDimension,
  recommendTemplateCanvasSize,
  TEMPLATE_CANVAS_SIZE_PRESETS,
  templateCanvasOrientation,
} from '../templateCanvasSize';

interface CanvasSizeSelection {
  id: string;
  width: number;
  height: number;
}

interface TemplateCreatorWizardProps {
  open: boolean;
  onClose: () => void;
  mode?: 'template' | 'poster';
  onApply: (
    compiled: CompiledPosterReconstruction,
    meta: { source: PosterReconstructionSource; model: string | null },
  ) => void;
}

export function TemplateCreatorWizard({ open, onClose, mode = 'template', onApply }: TemplateCreatorWizardProps) {
  useModalScrollLock(open);
  const [reference, setReference] = useState<PreparedPosterImage | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSizeSelection | null>(null);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [guideOpacity, setGuideOpacity] = useState(0.22);
  const [includeReferenceGuide, setIncludeReferenceGuide] = useState(true);
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
  }) => {
    if (!reference || !canvasSize) return;
    const compiled = await compilePosterReconstruction({
      plan: current.plan,
      reference,
      canvasSize,
      referenceGuideOpacity: creatingPoster && !includeReferenceGuide ? 0 : guideOpacity,
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
    if (!canvasSize) {
      setError('Choose the final poster size before creating the draft.');
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
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden overscroll-none bg-black/65 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-reconstruction-title"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 dark:border-zinc-700">
          <div className="min-w-0">
            <h2 id="poster-reconstruction-title" className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-white">
              {creatingPoster ? 'Create an editable poster' : 'Create a template from a flat poster'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
              {creatingPoster
                ? 'AI reconstructs editable text, basic shapes, and image regions, then opens the result directly in the editor.'
                : 'AI reconstructs editable text, basic shapes, and image regions. You polish the draft, confirm the fillable fields, then save it to your template library.'}
            </p>
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
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Upload the reference first. Its shape will be detected and the closest standard
                  high-resolution size will be recommended.
                </p>
              </div>
            )}
            {reference && recommendedPreset && originalCanvasSize && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  2. Choose the final poster size
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Detected {reference.sourceWidth}×{reference.sourceHeight} ({templateCanvasOrientation(
                    reference.sourceWidth,
                    reference.sourceHeight,
                  ).toLowerCase()}). The closest standard size is{' '}
                  <strong className="text-zinc-700 dark:text-zinc-200">
                    {recommendedPreset.width}×{recommendedPreset.height}
                  </strong>.
                </p>
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
                        <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {preset.description}
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
                </>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
              <p className="font-semibold text-zinc-800 dark:text-zinc-100">What happens next</p>
              {creatingPoster ? (
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>The reconstructed poster opens directly in the editor.</li>
                  <li>Every detected part is available as an editable layer.</li>
                  <li>Correct fonts, crops, backgrounds, and any missed decoration.</li>
                  <li>Save or export the poster normally when you are finished.</li>
                </ol>
              ) : (
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>The editable draft opens in the canvas.</li>
                  <li>Likely titles, dates, names, and photos are labeled automatically.</li>
                  <li>Correct fonts, crops, backgrounds, and any missed decoration.</li>
                  <li>Click text or image layers to add or correct template fields.</li>
                  <li>Save the finished template to the cloud library.</li>
                </ol>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              This first version makes a strong starting draft, not a pixel-perfect layered source.
              Complex backgrounds and overlapping artwork still need manual correction.
            </div>
          </section>
        </div>

        {analysis && (
          <section className="border-t border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-700 dark:bg-zinc-950/40">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">4. Review unsafe image crops</h3>
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
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/20">
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
                          className="ml-auto rounded px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
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
        </div>

        <div className="shrink-0 border-t border-zinc-200 p-3 sm:px-5 sm:py-4 dark:border-zinc-700">
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
  return plan.elements.filter((item) => item.kind === 'image_region' && item.replacementRecommended);
}

function orientationFor(aspect: number): 'landscape' | 'portrait' | 'square' {
  if (aspect > 1.15) return 'landscape';
  if (aspect < 0.87) return 'portrait';
  return 'square';
}
