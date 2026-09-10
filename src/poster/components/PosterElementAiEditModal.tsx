import { useEffect, useRef, useState } from 'react';
import type { Object as FabricObject } from 'fabric';
import { prepareReconstructionFontCatalog } from '../ai/prepareReconstructionFontCatalog';
import {
  applyPosterElementEdit,
  sanitizedPosterElementProperties,
} from '../ai/applyPosterElementEdit';
import { capturePosterThumbnail, getFabricCanvasRef } from '../canvasRef';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { requestPosterElementEdit } from '../services/posterElementEditApi';
import { usePosterStore } from '../store/posterStore';

interface Props {
  selectedId: string;
  onClose: () => void;
  onApplied?: (replacementIds: string[]) => void;
}

export function PosterElementAiEditModal({ selectedId, onClose, onApplied }: Props) {
  useModalScrollLock(true);
  const [instruction, setInstruction] = useState('Make this selected layer match the original reference more closely.');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const selected = usePosterStore((state) => state.elements.find((element) => element.id === selectedId));
  const reference = usePosterStore((state) => state.aiReference);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function applyEdit() {
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
      const snapshot = await capturePosterThumbnail(
        initial.canvasWidth,
        initial.canvasHeight,
        initial.canvasBackground,
        960,
      );
      // Thumbnail capture temporarily clears Fabric's active object. Publish a
      // fresh selection array so the canvas restores the same selected layer.
      usePosterStore.setState((state) => ({ selectedIds: [...state.selectedIds] }));
      if (!snapshot) throw new Error('The current poster preview could not be prepared.');
      const fontCatalog = await prepareReconstructionFontCatalog().catch(() => null);
      const previewScale = Math.min(1, 960 / initial.canvasWidth);
      const response = await requestPosterElementEdit({
        reference: initial.aiReference,
        currentDraft: {
          dataUrl: snapshot,
          width: Math.max(64, Math.round(initial.canvasWidth * previewScale)),
          height: Math.max(64, Math.round(initial.canvasHeight * previewScale)),
        },
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
      setStatus('Applying only the selected-layer replacement…');
      const latest = usePosterStore.getState();
      const result = await applyPosterElementEdit({
        elements: latest.elements,
        selectedId,
        patch: response.patch,
        reference: initial.aiReference,
        canvasWidth: latest.canvasWidth,
        canvasHeight: latest.canvasHeight,
        fontCatalogFamilies: fontCatalog?.families,
      });
      usePosterStore.setState({
        elements: result.elements,
        selectedIds: result.replacementIds,
      });
      usePosterStore.getState().pushHistory();
      onApplied?.(result.replacementIds);
      onClose();
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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="poster-ai-edit-title" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-zinc-900 shadow-xl dark:bg-zinc-900 dark:text-white">
        <div className="flex items-center justify-between gap-4">
          <h2 id="poster-ai-edit-title" className="text-xl font-semibold">Edit selected layer with AI</h2>
          <button type="button" disabled={busy} onClick={onClose}>Close</button>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {selected ? `Selected: ${selectedLayerLabel(selected)}` : 'The selected layer is unavailable.'}
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          The AI compares this layer with the original reference. Everything else on the poster remains unchanged. It may split this layer when the original uses distinct sizes or styles.
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
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="For example: Match the original letter spacing, height, and width."
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
        />
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-zinc-500">{status}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            disabled={busy || !reference || !selected || selected.locked || instruction.trim().length < 3}
            onClick={() => void applyEdit()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Editing…' : 'Apply AI edit'}
          </button>
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
