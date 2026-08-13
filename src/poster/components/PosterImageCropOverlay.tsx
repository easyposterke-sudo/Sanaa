import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FabricImage, type Canvas } from 'fabric';
import { usePosterStore } from '../store/posterStore';
import type { PosterImageElement, Poster3DTextElement } from '../types';
import { bakePosterImageCrop, type PosterImageCropRect } from '../posterImageCrop';

const MIN_CROP = 8;
/** Minimum touch target (~44px) so corners are usable on phones; knob stays visually small. */
const HANDLE_HIT = 44;
const HANDLE_KNOB = 14;

type HandleId = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function constrainCropRect(r: PosterImageCropRect, bounds: PosterImageCropRect): PosterImageCropRect {
  let { left, top, width, height } = r;
  width = Math.max(MIN_CROP, Math.min(width, bounds.width));
  height = Math.max(MIN_CROP, Math.min(height, bounds.height));
  left = clamp(left, bounds.left, bounds.left + bounds.width - width);
  top = clamp(top, bounds.top, bounds.top + bounds.height - height);
  return { left, top, width, height };
}

function clientToCanvas(
  clientX: number,
  clientY: number,
  wrapRect: DOMRect,
  scale: number
): { x: number; y: number } {
  return {
    x: (clientX - wrapRect.left) / scale,
    y: (clientY - wrapRect.top) / scale,
  };
}

interface PosterImageCropOverlayProps {
  zoomWrapperRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<Canvas | null>;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  targetId: string;
  readOnly: boolean;
}

export function PosterImageCropOverlay({
  zoomWrapperRef,
  canvasRef,
  canvasWidth,
  canvasHeight,
  scale,
  targetId,
  readOnly,
}: PosterImageCropOverlayProps) {
  const updateElement = usePosterStore((s) => s.updateElement);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const setImageCropTargetId = usePosterStore((s) => s.setImageCropTargetId);
  const elements = usePosterStore((s) => s.elements);

  const [cropRect, setCropRect] = useState<PosterImageCropRect | null>(null);
  const [imageBounds, setImageBounds] = useState<PosterImageCropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragRef = useRef<{
    handle: HandleId;
    startX: number;
    startY: number;
    startRect: PosterImageCropRect;
    bounds: PosterImageCropRect;
  } | null>(null);

  const maskUid = useId().replace(/:/g, '');

  const syncFromFabric = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const obj = canvas.getObjects().find(
      (o) => (o as { data?: { posterId?: string } }).data?.posterId === targetId
    );
    if (!obj || !(obj instanceof FabricImage)) {
      return false;
    }
    const br = obj.getBoundingRect();
    const bounds: PosterImageCropRect = {
      left: br.left,
      top: br.top,
      width: br.width,
      height: br.height,
    };
    setImageBounds(bounds);
    setCropRect((prev) => {
      if (prev) return prev;
      return constrainCropRect({ ...bounds }, bounds);
    });
    return true;
  }, [canvasRef, targetId]);

  useEffect(() => {
    setCropRect(null);
    setImageBounds(null);
    setError(null);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!syncFromFabric()) {
          setImageCropTargetId(null);
        }
      });
    });
    return () => cancelAnimationFrame(t);
  }, [targetId, syncFromFabric, setImageCropTargetId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setImageCropTargetId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setImageCropTargetId]);

  const onPointerDown = (e: React.PointerEvent, handle: HandleId) => {
    if (readOnly || busy || !cropRect || !imageBounds) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = zoomWrapperRef.current?.getBoundingClientRect();
    if (!wrap) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY, wrap, scale);
    dragRef.current = {
      handle,
      startX: x,
      startY: y,
      startRect: { ...cropRect },
      bounds: imageBounds,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !cropRect) return;
    const wrap = zoomWrapperRef.current?.getBoundingClientRect();
    if (!wrap) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY, wrap, scale);
    const dx = x - d.startX;
    const dy = y - d.startY;
    const s = d.startRect;
    const b = d.bounds;
    let next: PosterImageCropRect;

    if (d.handle === 'move') {
      next = {
        left: s.left + dx,
        top: s.top + dy,
        width: s.width,
        height: s.height,
      };
    } else {
      let { left, top, width, height } = s;
      if (d.handle === 'se') {
        width = s.width + dx;
        height = s.height + dy;
      } else if (d.handle === 'sw') {
        left = s.left + dx;
        width = s.width - dx;
        height = s.height + dy;
      } else if (d.handle === 'ne') {
        top = s.top + dy;
        width = s.width + dx;
        height = s.height - dy;
      } else {
        left = s.left + dx;
        top = s.top + dy;
        width = s.width - dx;
        height = s.height - dy;
      }
      if (width < 0) {
        left += width;
        width = -width;
      }
      if (height < 0) {
        top += height;
        height = -height;
      }
      next = { left, top, width, height };
    }

    setCropRect(constrainCropRect(next, b));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleApply = async () => {
    const canvas = canvasRef.current;
    if (!canvas || readOnly || busy || !cropRect || !imageBounds) return;
    const el = elements.find((x) => x.id === targetId) as
      | PosterImageElement
      | Poster3DTextElement
      | undefined;
    if (!el || (el.type !== 'image' && el.type !== '3d-text')) {
      setImageCropTargetId(null);
      return;
    }
    const obj = canvas.getObjects().find(
      (o) => (o as { data?: { posterId?: string } }).data?.posterId === targetId
    );
    if (!obj || !(obj instanceof FabricImage)) {
      setImageCropTargetId(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const baked = await bakePosterImageCrop(el, obj, cropRect);
      pushHistory();
      const layout = {
        left: baked.left,
        top: baked.top,
        scaleX: baked.scaleX,
        scaleY: baked.scaleY,
        angle: 0,
        maskImageOffsetX: 0.5,
        maskImageOffsetY: 0.5,
        maskImageScale: 1,
      };
      if (el.type === '3d-text') {
        updateElement(targetId, { image: baked.dataUrl, ...layout });
      } else {
        updateElement(targetId, { src: baked.dataUrl, ...layout });
      }
      setImageCropTargetId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop image');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => setImageCropTargetId(null);

  if (!cropRect || !imageBounds) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
        <p className="rounded bg-white/90 px-3 py-2 text-sm text-zinc-700 shadow dark:bg-zinc-900 dark:text-zinc-200">
          Loading crop…
        </p>
      </div>
    );
  }

  const { left, top, width, height } = cropRect;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Dim outside crop */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      >
        <defs>
          <mask id={`poster-crop-mask-${maskUid}`}>
            <rect width={canvasWidth} height={canvasHeight} fill="white" />
            <rect x={left} y={top} width={width} height={height} fill="black" rx={1} />
          </mask>
        </defs>
        <rect
          width={canvasWidth}
          height={canvasHeight}
          fill="rgba(0,0,0,0.45)"
          mask={`url(#poster-crop-mask-${maskUid})`}
        />
        <rect
          x={left}
          y={top}
          width={width}
          height={height}
          fill="none"
          stroke="white"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Move + handles — large hit areas + touch-action:none to avoid scroll/zoom fighting the drag */}
      <div
        className="pointer-events-auto absolute cursor-move touch-none select-none overscroll-contain border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{ left, top, width, height }}
        onPointerDown={(e) => onPointerDown(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((h) => {
          const outer: React.CSSProperties = {
            position: 'absolute',
            width: HANDLE_HIT,
            height: HANDLE_HIT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
          };
          const inset = HANDLE_HIT / 2;
          if (h === 'nw') {
            outer.left = -inset;
            outer.top = -inset;
            outer.cursor = 'nwse-resize';
          }
          if (h === 'ne') {
            outer.right = -inset;
            outer.top = -inset;
            outer.cursor = 'nesw-resize';
          }
          if (h === 'sw') {
            outer.left = -inset;
            outer.bottom = -inset;
            outer.cursor = 'nesw-resize';
          }
          if (h === 'se') {
            outer.right = -inset;
            outer.bottom = -inset;
            outer.cursor = 'nwse-resize';
          }
          return (
            <div
              key={h}
              style={outer}
              className="select-none"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown(e, h);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="pointer-events-none rounded-sm border border-black/45 bg-white shadow-sm"
                style={{ width: HANDLE_KNOB, height: HANDLE_KNOB }}
              />
            </div>
          );
        })}
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 touch-none flex-col items-center gap-2 overscroll-contain">
        {error && (
          <p className="max-w-xs rounded bg-red-600 px-2 py-1 text-center text-xs text-white shadow">
            {error}
          </p>
        )}
        <div className="flex gap-2 rounded-lg border border-zinc-200 bg-white/95 px-2 py-2 shadow-lg dark:border-zinc-600 dark:bg-zinc-900/95">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="min-h-11 min-w-[4.5rem] touch-manipulation rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={busy}
            className="min-h-11 min-w-[6.5rem] touch-manipulation rounded-md bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
