import { useEffect, useRef, useState } from 'react';
import { Canvas } from '../../components/canvas/Canvas';
import { useEditorStore } from '../../store/editorStore';
import { loadFontsForPosterElements } from '../loadPosterFonts';
import { usePosterStore } from '../store/posterStore';
import type { Poster3DTextElement } from '../types';
import { serializeEditorState } from '../utils/serializeEditorState';
import {
  computeUniform3DTextReplacement,
  readRasterDimensions,
  trimTransparentRaster,
} from '../threeTextHandoff';

interface Poster3DPreviewRendererProps {
  elementIds: string[];
  onRendered: (elementId: string) => void;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Sequentially replaces AI SVG placeholders with genuine WebGL exports. It is
 * mounted only for reconstruction-created 3D layers and never touches normal
 * poster text, shapes, or images.
 */
export function Poster3DPreviewRenderer({
  elementIds,
  onRendered,
}: Poster3DPreviewRendererProps) {
  const currentId = elementIds[0] ?? null;
  const [configuredId, setConfiguredId] = useState<string | null>(null);
  const renderingIdRef = useRef<string | null>(null);
  const api = useEditorStore((state) => state.webglExportAPI);
  const loadPoster3DConfig = useEditorStore((state) => state.loadPoster3DConfig);
  const setWebGLExportAPI = useEditorStore((state) => state.setWebGLExportAPI);
  const updateElement = usePosterStore((state) => state.updateElement);

  useEffect(() => {
    if (!currentId) {
      setConfiguredId(null);
      renderingIdRef.current = null;
      return;
    }
    let cancelled = false;
    setConfiguredId(null);
    renderingIdRef.current = null;
    setWebGLExportAPI(null);
    const element = usePosterStore.getState().elements.find(
      (candidate): candidate is Poster3DTextElement =>
        candidate.id === currentId && candidate.type === '3d-text',
    );
    if (!element) {
      onRendered(currentId);
      return;
    }

    void loadFontsForPosterElements([element]).finally(() => {
      if (cancelled) return;
      loadPoster3DConfig(element.config);
      setConfiguredId(currentId);
    });
    return () => {
      cancelled = true;
    };
  }, [currentId, loadPoster3DConfig, onRendered, setWebGLExportAPI]);

  useEffect(() => {
    if (!currentId || configuredId !== currentId || !api) return;
    if (renderingIdRef.current === currentId) return;
    renderingIdRef.current = currentId;
    let cancelled = false;

    void (async () => {
      try {
        await api.whenContentReady?.();
        await nextPaint();
        if (cancelled) return;
        const rawDataUrl = api.toDataURL(2);
        if (!rawDataUrl) throw new Error('The automatic 3D renderer returned no image.');
        const exported = await trimTransparentRaster(rawDataUrl);
        if (cancelled) return;

        const existing = usePosterStore.getState().elements.find(
          (candidate): candidate is Poster3DTextElement =>
            candidate.id === currentId && candidate.type === '3d-text',
        );
        if (!existing) return;
        const previousIntrinsic = existing.previewWidth && existing.previewHeight
          ? { width: existing.previewWidth, height: existing.previewHeight }
          : await readRasterDimensions(existing.image);
        const geometry = computeUniform3DTextReplacement(existing, exported, previousIntrinsic);
        updateElement(currentId, {
          image: exported.dataUrl,
          config: serializeEditorState(),
          ...geometry,
          userPosterImageId: undefined,
        });
      } catch (error) {
        console.warn('Automatic 3D poster preview could not be rendered.', error);
      } finally {
        if (!cancelled) onRendered(currentId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, configuredId, currentId, onRendered, updateElement]);

  if (!currentId) return null;
  return (
    <>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-zinc-950/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
        Rendering shiny 3D title…
      </div>
      {configuredId === currentId && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -left-[10000px] top-0 h-[400px] w-[800px] opacity-0"
        >
          <Canvas key={configuredId} forceMultiLayer orbitZoomScale={1.5} />
        </div>
      )}
    </>
  );
}
