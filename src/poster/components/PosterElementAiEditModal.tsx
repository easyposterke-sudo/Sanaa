import { AiPricingHint } from '../../billing/AiCostNotice';
import { useEffect, useRef, useState } from 'react';
import type { Object as FabricObject } from 'fabric';
import { prepareReconstructionFontCatalog } from '../ai/prepareReconstructionFontCatalog';
import {
  applyPosterElementEdit,
  sanitizedPosterElementProperties,
} from '../ai/applyPosterElementEdit';
import { getFabricCanvasRef } from '../canvasRef';
import { renderReferenceDraft } from '../ai/renderReferenceDraft';
import { cropElementEditDetail, elementEditDetailBox } from '../ai/elementEditPreview';
import type { PosterProject } from '../types';
import type { PosterAiReference } from '../store/posterStore';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { requestPosterElementEdit } from '../services/posterElementEditApi';
import { usePosterStore } from '../store/posterStore';

interface Props {
  selectedId: string;
  onClose: () => void;
  onApplied?: (replacementIds: string[]) => void;
}

interface EditPreview {
  original: PosterProject;
  reference: PosterAiReference;
  result: Awaited<ReturnType<typeof applyPosterElementEdit>>;
  images: string[];
  summary: string;
}

function stillCurrent(preview: Pick<EditPreview, 'original' | 'reference'>): boolean {
  const state = usePosterStore.getState();
  return state.elements === preview.original.elements && state.aiReference === preview.reference &&
    state.canvasWidth === preview.original.canvasWidth && state.canvasHeight === preview.original.canvasHeight &&
    state.canvasBackground === preview.original.canvasBackground;
}

export function PosterElementAiEditModal({ selectedId, onClose, onApplied }: Props) {
  useModalScrollLock(true);
  const [instruction, setInstruction] = useState('Match this layer to the original reference. Correct visible differences in shape, position, proportions, and styling while preserving details that already match.');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<EditPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selected = usePosterStore((state) => state.elements.find((element) => element.id === selectedId));
  const reference = usePosterStore((state) => state.aiReference);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function previewEdit() {
    const initial = usePosterStore.getState();
    const element = initial.elements.find((candidate) => candidate.id === selectedId);
    if (!element || !initial.aiReference) {
      setError('The selected layer or its original reference is no longer available.');
      return;
    }
    if (element.locked) {
      setError('Unlock this layer before editing it with AI.');
      return;
    }
    setBusy(true);
    setPreview(null);
    setError('');
    setStatus('Comparing this layer with the original…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const selectedBox = normalizedSelectedBox(
        selectedId,
        initial.canvasWidth,
        initial.canvasHeight,
        element,
      );
      const original: PosterProject = { elements: initial.elements, canvasWidth: initial.canvasWidth, canvasHeight: initial.canvasHeight, canvasBackground: initial.canvasBackground };
      const before = await renderReferenceDraft(original, 1536);
      const snapshot = before.toDataURL('image/png');
      const referenceImage = initial.aiReference.originalDataUrl ?? initial.aiReference.dataUrl;
      const detailBox = elementEditDetailBox([selectedBox]);
      const [referenceDataUrl, currentDraftDataUrl] = await Promise.all([
        cropElementEditDetail(referenceImage, detailBox),
        cropElementEditDetail(snapshot, detailBox),
      ]);
      const fontCatalog = element.type === 'text'
        ? await prepareReconstructionFontCatalog(element.text.slice(0, 60)).catch(() => null) : null;
      if (controller.signal.aborted) return;
      const response = await requestPosterElementEdit({
        reference: {
          dataUrl: initial.aiReference.dataUrl,
          width: initial.aiReference.width,
          height: initial.aiReference.height,
        },
        currentDraft: {
          dataUrl: before.toDataURL('image/webp', 0.9),
          width: Math.max(64, before.width),
          height: Math.max(64, before.height),
        },
        detail: { box: detailBox, referenceDataUrl, currentDraftDataUrl },
        instruction: instruction.trim(),
        selected: {
          id: element.id,
          type: element.type,
          label: selectedLayerLabel(element),
          box: selectedBox,
          propertiesJson: sanitizedPosterElementProperties(element),
        },
        ...(fontCatalog ? { fontCatalog: fontCatalog.request } : {}),
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStatus('Preparing the before-and-after comparison…');
      const result = await applyPosterElementEdit({
        elements: initial.elements,
        selectedId,
        patch: response.patch,
        reference: initial.aiReference,
        canvasWidth: initial.canvasWidth,
        canvasHeight: initial.canvasHeight,
        fontCatalogFamilies: fontCatalog?.families,
      });
      const after = await renderReferenceDraft({ ...original, elements: result.elements }, 1536);
      const comparisonBox = elementEditDetailBox([selectedBox, ...response.patch.elements.map(item => item.box)]);
      const images = await Promise.all([referenceImage, snapshot, after.toDataURL('image/png')].map(url => cropElementEditDetail(url, comparisonBox)));
      if (controller.signal.aborted) return;
      const next = { original, reference: initial.aiReference, result, images, summary: response.patch.summary };
      if (!stillCurrent(next)) throw new Error('The poster changed while this edit was being prepared. Generate a new preview for the current layer.');
      setPreview(next);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'The selected layer could not be edited.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setStatus('');
    }
  }

  function applyPreview() {
    if (!preview) return;
    if (!stillCurrent(preview)) {
      setPreview(null);
      setError('The poster changed after this preview. Generate a new preview before applying.');
      return;
    }
    usePosterStore.setState({ elements: preview.result.elements, selectedIds: preview.result.replacementIds });
    usePosterStore.getState().pushHistory();
    onApplied?.(preview.result.replacementIds);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="poster-ai-edit-title" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 text-zinc-900 shadow-xl dark:bg-zinc-900 dark:text-white ${preview ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="poster-ai-edit-title" className="text-xl font-semibold">Edit selected layer with AI</h2>
          <button type="button" disabled={busy} onClick={onClose}>Close</button>
        </div>
        <AiPricingHint />
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {selected ? `Selected: ${selectedLayerLabel(selected)}` : 'The selected layer is unavailable.'}
        </p>
        {!reference && (
          <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            The original reference is unavailable in this editor session. Recreate the poster from its reference to enable this tool.
          </p>
        )}
        <label htmlFor="poster-ai-edit-instruction" className="mt-5 block text-sm font-medium">
          What should change?
        </label>
        <textarea
          id="poster-ai-edit-instruction"
          rows={5}
          maxLength={1500}
          disabled={busy || !reference || !selected}
          value={instruction}
          onChange={(event) => { setInstruction(event.target.value); setPreview(null); }}
          placeholder={selected?.type === 'path' ? 'For example: Match the wave’s peaks, curve direction, and thickness to the reference.' : 'For example: Match the original letter spacing, height, and width.'}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
        />
        {preview && (
          <div className="mt-4">
            <p className="text-sm">Compare the contour, position, and styling before applying. Your current layer is unchanged.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {['Original reference', 'Current layer', 'Proposed edit'].map((label, index) => (
                <figure key={label}>
                  <figcaption className="mb-2 text-sm font-medium">{label}</figcaption>
                  <img src={preview.images[index]} alt={label} className="max-h-80 w-full rounded border border-zinc-300 object-contain dark:border-zinc-700" />
                </figure>
              ))}
            </div>
            <p className="mt-3 text-sm text-zinc-500">{preview.summary}</p>
          </div>
        )}
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-zinc-500">{status}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={busy || !reference || !selected || selected.locked || instruction.trim().length < 3}
            onClick={() => void previewEdit()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Editing…' : preview ? 'Try another edit' : 'Preview AI edit'}
          </button>
          {preview && <button type="button" onClick={applyPreview} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Apply this edit</button>}
        </div>
      </div>
    </div>
  );
}

function normalizedSelectedBox(
  id: string,
  canvasWidth: number,
  canvasHeight: number,
  fallback: { left: number; top: number; scaleX: number; scaleY: number },
) {
  const object = getFabricCanvasRef()?.getObjects().find((candidate) =>
    (candidate as FabricObject & { data?: { posterId?: string } }).data?.posterId === id,
  );
  const bounds = object?.getBoundingRect();
  const left = bounds?.left ?? fallback.left;
  const top = bounds?.top ?? fallback.top;
  const width = bounds?.width ?? Math.max(8, 120 * Math.abs(fallback.scaleX));
  const height = bounds?.height ?? Math.max(8, 80 * Math.abs(fallback.scaleY));
  return {
    x: clamp(left / canvasWidth, -0.5, 1.5),
    y: clamp(top / canvasHeight, -0.5, 1.5),
    width: clamp(width / canvasWidth, 0.005, 1.5),
    height: clamp(height / canvasHeight, 0.005, 1.5),
  };
}

function selectedLayerLabel(element: { type: string; layerName?: string; text?: string }): string {
  return element.layerName?.trim() || element.text?.trim().slice(0, 120) || `${element.type} layer`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
