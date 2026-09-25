import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PreparedPosterImage } from '../ai/preparePosterImage';
import { cropPosterAsset, polygonCropBounds, type NormalizedCrop, type NormalizedPoint, type PosterAssetCutout } from '../ai/cropPosterAsset';
import { clampNormalizedCrop, moveNormalizedCrop, resizeNormalizedCrop, zoomForCrop, type CropHandle } from '../ai/posterAssetCropGeometry';
import type { ReconstructionImageReplacement } from '../ai/compilePosterReconstruction';

const HANDLES: { id: CropHandle; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 50, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 100, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 100, y: 50, cursor: 'ew-resize' },
  { id: 'se', x: 100, y: 100, cursor: 'nwse-resize' },
  { id: 's', x: 50, y: 100, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 100, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 50, cursor: 'ew-resize' },
];

type Drag =
  | { mode: 'draw' | 'move' | 'resize'; start: NormalizedPoint; original: NormalizedCrop; handle?: CropHandle }
  | { mode: 'pen'; start: NormalizedPoint }
  | { mode: 'pan'; clientX: number; clientY: number; scrollLeft: number; scrollTop: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function PosterAssetCropDialog({ reference, sourceFile, item, onCancel, onApply }: {
  reference: PreparedPosterImage;
  /** Original upload, used only for the manual crop. AI analysis keeps its prepared working copy. */
  sourceFile?: File | null;
  item: ReconstructionElement;
  onCancel: () => void;
  onApply: (replacement: ReconstructionImageReplacement, crop: NormalizedCrop) => void;
}) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceFile) return;
    const url = URL.createObjectURL(sourceFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);
  const source = useMemo(() => sourceFile
    ? originalUrl ? { dataUrl: originalUrl, width: reference.sourceWidth, height: reference.sourceHeight } : null
    : reference, [sourceFile, originalUrl, reference]);
  const [tool, setTool] = useState<'rectangle' | 'circle' | 'pen'>('rectangle');
  const [crop, setCrop] = useState<NormalizedCrop>(() => clampNormalizedCrop({ ...item.box }));
  const [penPoints, setPenPoints] = useState<NormalizedPoint[]>([]);
  const [pan, setPan] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focusTarget, setFocusTarget] = useState<NormalizedPoint | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [removeWhite, setRemoveWhite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const initialFocusRef = useRef(false);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const fitScale = source && viewportSize.width && viewportSize.height
    ? Math.min(1, (viewportSize.width - 16) / source.width, (viewportSize.height - 16) / source.height)
    : 0;
  const surfaceWidth = source ? source.width * fitScale * zoom : 0;
  const surfaceHeight = source ? source.height * fitScale * zoom : 0;

  useEffect(() => {
    if (!source || !fitScale || initialFocusRef.current) return;
    initialFocusRef.current = true;
    setFocusTarget({ x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 });
    setZoom(zoomForCrop(crop, source.width, source.height, fitScale));
  }, [source, fitScale, crop]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !focusTarget || !surfaceWidth || !surfaceHeight) return;
    viewport.scrollLeft = focusTarget.x * surfaceWidth - viewport.clientWidth / 2;
    viewport.scrollTop = focusTarget.y * surfaceHeight - viewport.clientHeight / 2;
    setFocusTarget(null);
  }, [focusTarget, surfaceWidth, surfaceHeight]);

  const point = (event: React.PointerEvent<HTMLDivElement>): NormalizedPoint => {
    const bounds = surfaceRef.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!source || busy || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pan) {
      const viewport = viewportRef.current!;
      dragRef.current = { mode: 'pan', clientX: event.clientX, clientY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      return;
    }
    const start = point(event);
    if (tool === 'pen') {
      dragRef.current = { mode: 'pen', start };
      setPenPoints((points) => [...points, start]);
      return;
    }
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-crop-handle]')?.dataset.cropHandle as CropHandle | undefined;
    const mode = handle ? 'resize' : target.closest('[data-crop-move]') ? 'move' : 'draw';
    dragRef.current = { mode, start, original: { ...crop }, handle };
    if (mode === 'draw') setCrop({ ...start, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !source) return;
    if (drag.mode === 'pan') {
      const viewport = viewportRef.current!;
      viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.clientX);
      viewport.scrollTop = drag.scrollTop - (event.clientY - drag.clientY);
      return;
    }
    const end = point(event);
    if (drag.mode === 'pen') {
      setPenPoints((points) => {
        const last = points.at(-1);
        const threshold = 2 / Math.max(1, Math.min(surfaceWidth, surfaceHeight));
        return last && Math.hypot(end.x - last.x, end.y - last.y) < threshold ? points : [...points, end];
      });
      return;
    }
    const dx = end.x - drag.start.x;
    const dy = end.y - drag.start.y;
    if (drag.mode === 'move') {
      setCrop(moveNormalizedCrop(drag.original, dx, dy));
    } else if (drag.mode === 'resize' && drag.handle) {
      setCrop(resizeNormalizedCrop(drag.original, drag.handle, dx, dy, 2 / source.width, 2 / source.height));
    } else if (tool === 'circle' && event.shiftKey) {
      const diameter = Math.min(Math.abs(dx) * source.width, Math.abs(dy) * source.height);
      const width = diameter / source.width;
      const height = diameter / source.height;
      setCrop({ x: drag.start.x - (dx < 0 ? width : 0), y: drag.start.y - (dy < 0 ? height : 0), width, height });
    } else {
      setCrop({ x: Math.min(drag.start.x, end.x), y: Math.min(drag.start.y, end.y), width: Math.abs(dx), height: Math.abs(dy) });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) onPointerMove(event);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const focusCrop = () => {
    const selected = tool === 'pen' && penPoints.length >= 3 ? polygonCropBounds(penPoints) : crop;
    setFocusTarget({ x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 });
  };
  const changeZoom = (next: number) => {
    focusCrop();
    setZoom(clamp(next, 1, 16));
  };

  const apply = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const selectedCrop = tool === 'pen' ? polygonCropBounds(penPoints) : crop;
      if (selectedCrop.width * source.width < 2 || selectedCrop.height * source.height < 2) {
        throw new Error('Choose a larger area of the poster.');
      }
      const cutout: PosterAssetCutout | undefined = tool === 'circle'
        ? { kind: 'ellipse' }
        : tool === 'pen' ? { kind: 'polygon', points: penPoints } : undefined;
      onApply(await cropPosterAsset(source, selectedCrop, removeWhite, cutout), selectedCrop);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The selected area could not be cropped.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-3" role="dialog" aria-modal="true" aria-label={`Crop ${item.label} from poster`}>
      <div className="flex h-[min(95dvh,860px)] w-full max-w-3xl flex-col rounded-xl bg-white p-3 shadow-2xl sm:p-4 dark:bg-zinc-900">
        <h3 className="text-base font-semibold">Crop “{item.label}” from the poster</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Crop shape">
          {(['rectangle', 'circle', 'pen'] as const).map((shape) => (
            <button key={shape} type="button" disabled={busy} onClick={() => { setTool(shape); setPenPoints([]); setPan(false); setError(null); }}
              aria-pressed={tool === shape}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${tool === shape ? 'border-violet-600 bg-violet-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
              {shape === 'pen' ? 'Pen' : shape === 'circle' ? 'Circle / ellipse' : 'Rectangle'}
            </button>
          ))}
          {tool === 'pen' && <button type="button" onClick={() => setPenPoints((points) => points.slice(0, -1))} disabled={!penPoints.length || busy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Undo point</button>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Crop zoom">
          <button type="button" disabled={busy || zoom <= 1} onClick={() => changeZoom(zoom / 1.5)} className="rounded border px-2 py-1 disabled:opacity-50" aria-label="Zoom out">−</button>
          <input type="range" min="1" max="16" step="0.25" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} disabled={busy} aria-label="Crop zoom level" className="w-24 sm:w-36" />
          <button type="button" disabled={busy || zoom >= 16} onClick={() => changeZoom(zoom * 1.5)} className="rounded border px-2 py-1 disabled:opacity-50" aria-label="Zoom in">+</button>
          <span className="w-12 tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" disabled={busy} onClick={() => changeZoom(1)} className="rounded border px-2 py-1 disabled:opacity-50">Fit</button>
          <button type="button" disabled={busy} onClick={() => { focusCrop(); setZoom(zoomForCrop(crop, source?.width ?? reference.width, source?.height ?? reference.height, fitScale || 1)); }} className="rounded border px-2 py-1 disabled:opacity-50">Zoom to crop</button>
          <button type="button" disabled={busy} aria-pressed={pan} onClick={() => setPan((value) => !value)} className={`rounded border px-2 py-1 disabled:opacity-50 ${pan ? 'border-violet-600 bg-violet-100 dark:bg-violet-900' : ''}`}>Pan image</button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Drag to select. Drag the selection to move it, or use its handles to resize. Hold Shift while drawing for a perfect circle. Use Pan image to move around while zoomed in.</p>
        <div ref={viewportRef} data-testid="crop-viewport" className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950">
          {source && fitScale ? (
            <div ref={surfaceRef} className={`relative mx-auto touch-none select-none ${pan ? 'cursor-grab' : 'cursor-crosshair'}`}
              style={{ width: surfaceWidth, height: surfaceHeight }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onPointerCancel={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
              <img src={source.dataUrl} alt="Source poster for selecting a crop" className="pointer-events-none block h-full w-full" draggable={false} />
              {tool === 'pen' ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                  {penPoints.length > 1 && <polygon points={penPoints.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')} fill={penPoints.length >= 3 ? 'rgba(139,92,246,.25)' : 'none'} stroke="#a78bfa" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                  {penPoints.map(({ x, y }, index) => <circle key={index} cx={x * 1000} cy={y * 1000} r="5" fill="#7c3aed" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
                </svg>
              ) : (
                <div data-crop-move className={`absolute border-2 border-violet-400 bg-violet-400/20 ${tool === 'circle' ? 'rounded-full' : ''} ${pan ? 'pointer-events-none' : 'cursor-move'}`}
                  style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
                  {!pan && HANDLES.map((handle) => (
                    <div key={handle.id} data-crop-handle={handle.id} className="absolute flex h-11 w-11 items-center justify-center touch-none"
                      style={{ left: `${handle.x}%`, top: `${handle.y}%`, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}>
                      <span className="pointer-events-none h-3 w-3 rounded-sm border border-violet-700 bg-white shadow" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : <div className="flex h-full items-center justify-center text-sm text-zinc-500">Preparing full-resolution crop…</div>}
        </div>
        {item.imageRole === 'logo' && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={removeWhite} onChange={(event) => setRemoveWhite(event.target.checked)} /> Make connected white background transparent</label>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={busy || !source || (tool === 'pen' ? penPoints.length < 3 : crop.width * source.width < 2 || crop.height * source.height < 2)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Cropping…' : tool === 'rectangle' ? 'Use this crop' : 'Use this cutout'}</button>
        </div>
      </div>
    </div>
  );
}
