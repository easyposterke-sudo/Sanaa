import { useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas } from 'fabric';
import { usePosterStore } from '../store/posterStore';

/**
 * Scroll buffer used on desktop to allow negative-pan content to remain
 * at a positive scroll coordinate.
 */
const SBUF = 5000;

interface UsePosterZoomArgs {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<Canvas | null>;
  viewportWidth: number;
  viewportHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  fitCenterNonce: number;
}

export function usePosterZoom({
  viewportRef,
  canvasRef,
  viewportWidth,
  viewportHeight,
  canvasWidth,
  canvasHeight,
  fitCenterNonce,
}: UsePosterZoomArgs) {
  const lastCenteredNonceRef = useRef(0);
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startMidX: number;
    startMidY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // Re-center when fit/load/canvas-size changes
  useLayoutEffect(() => {
    if (viewportWidth < 32 || viewportHeight < 32) return;
    if (fitCenterNonce === lastCenteredNonceRef.current) return;
    lastCenteredNonceRef.current = fitCenterNonce;
    const fit = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
    const z = usePosterStore.getState().canvasZoom;
    const s = fit * z;
    const sw = canvasWidth * s;
    const sh = canvasHeight * s;
    const px = Math.max(0, (viewportWidth - sw) / 2);
    const py = Math.max(0, (viewportHeight - sh) / 2);
    usePosterStore.setState({ canvasPan: { x: px, y: py } });
    viewportRef.current?.scrollTo(SBUF, SBUF);
  }, [fitCenterNonce, viewportWidth, viewportHeight, canvasWidth, canvasHeight, viewportRef]);

  // Ctrl+Scroll = zoom toward pointer
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const v = viewportRef.current;
      if (!v) return;
      const r = v.getBoundingClientRect();
      const vx = e.clientX - r.left + v.scrollLeft;
      const vy = e.clientY - r.top + v.scrollTop;

      const st = usePosterStore.getState();
      const z0 = st.canvasZoom;

      // Multiplicative zoom for smoother feel (especially at extremes)
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const z1 = Math.max(0.1, Math.min(5, z0 * factor));
      if (Math.abs(z1 - z0) < 1e-9) return;

      const fit = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
      const s0 = fit * z0;
      const s1 = fit * z1;
      const { x: panX, y: panY } = st.canvasPan;

      // Use dynamic SBUF matching PosterCanvas.tsx to keep cursor-anchored zoom accurate
      const isCompact = viewportWidth < 768;
      const sb = isCompact ? 0 : SBUF;

      const cx = (vx - panX - sb) / s0;
      const cy = (vy - panY - sb) / s0;
      const panXNew = vx - cx * s1 - sb;
      const panYNew = vy - cy * s1 - sb;

      usePosterStore.setState({
        canvasZoom: z1,
        canvasPan: { x: panXNew, y: panYNew },
      });
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, true);
  }, [viewportRef, viewportWidth, viewportHeight, canvasWidth, canvasHeight]);

  // Two-finger pinch zoom on touch devices
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const distance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const disableFabric = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.selection = false;
      c.forEachObject((o) => {
        o.set('evented', false);
        o.set('selectable', false);
      });
      c.discardActiveObject();
      c.requestRenderAll();
    };

    const enableFabric = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.selection = true;
      const els = usePosterStore.getState().elements;
      c.forEachObject((o) => {
        const id = (o as { data?: { posterId?: string } }).data?.posterId;
        const storeEl = id ? els.find((e) => e.id === id) : null;
        const locked = !!storeEl?.locked;
        o.set('evented', !locked);
        o.set('selectable', !locked);
      });
      c.requestRenderAll();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      disableFabric();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const rect = el.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left + el.scrollLeft;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top + el.scrollTop;
      const st = usePosterStore.getState();
      pinchRef.current = {
        startDist: Math.max(1, distance(t1, t2)),
        startZoom: st.canvasZoom,
        startMidX: midX,
        startMidY: midY,
        startPanX: st.canvasPan.x,
        startPanY: st.canvasPan.y,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const rect = el.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left + el.scrollLeft;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top + el.scrollTop;

      const base = pinchRef.current;
      const ratio = distance(t1, t2) / base.startDist;
      const z1 = Math.max(0.1, Math.min(5, base.startZoom * ratio));
      const fit = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
      const s0 = fit * base.startZoom;
      const s1 = fit * z1;
      const compact = viewportWidth < 768;
      const sb = compact ? 0 : SBUF;

      const cx = (base.startMidX - base.startPanX - sb) / s0;
      const cy = (base.startMidY - base.startPanY - sb) / s0;
      usePosterStore.setState({
        canvasZoom: z1,
        canvasPan: { x: midX - cx * s1 - sb, y: midY - cy * s1 - sb },
      });
    };

    const onTouchEnd = () => {
      if (pinchRef.current) {
        pinchRef.current = null;
        enableFabric();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [viewportRef, canvasRef, viewportWidth, viewportHeight, canvasWidth, canvasHeight]);
}

export { SBUF };
