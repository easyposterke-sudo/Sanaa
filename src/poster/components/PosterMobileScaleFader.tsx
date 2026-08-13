import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { usePosterStore } from '../store/posterStore';
import { useIntentionalSliderDrag } from '../../hooks/useIntentionalSliderDrag';
import type { PosterElement } from '../types';

const MIN_P = 5;
const MAX_P = 400;
const STEP = 0.05;

function clampPercent(p: number): number {
  const t = Math.min(MAX_P, Math.max(MIN_P, p));
  return Math.round(t / STEP) * STEP;
}

function applyScalePercent(percent: number): void {
  const v = clampPercent(percent) / 100;
  const { elements, selectedIds, updateElement } = usePosterStore.getState();
  const unlocked = selectedIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is PosterElement => !!(e && !e.locked));
  for (const el of unlocked) {
    const signX = el.scaleX < 0 ? -1 : 1;
    const signY = el.scaleY < 0 ? -1 : 1;
    updateElement(el.id, { scaleX: signX * v, scaleY: signY * v });
  }
}

type Props = { readOnly: boolean };

export function PosterMobileScaleFader({ readOnly }: Props) {
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const elements = usePosterStore((s) => s.elements);

  const [interacting, setInteracting] = useState(false);
  const [localPercent, setLocalPercent] = useState<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingPercentRef = useRef<number | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const bumpInteracting = useCallback(() => {
    clearIdleTimer();
    setInteracting(true);
    idleTimerRef.current = setTimeout(() => {
      setInteracting(false);
      idleTimerRef.current = null;
    }, 2200);
  }, [clearIdleTimer]);

  useEffect(() => () => clearIdleTimer(), [clearIdleTimer]);

  const unlocked = useMemo(() => {
    return selectedIds
      .map((id) => elements.find((e) => e.id === id))
      .filter((e): e is PosterElement => !!(e && !e.locked));
  }, [selectedIds, elements]);

  const storeSliderPercent = useMemo(() => {
    if (unlocked.length === 0) return MIN_P;
    const refEl = unlocked[0]!;
    const avg = (Math.abs(refEl.scaleX) + Math.abs(refEl.scaleY)) / 2;
    return clampPercent(avg * 100);
  }, [unlocked]);

  useEffect(() => {
    if (readOnly || selectedIds.length === 0 || unlocked.length === 0) {
      draggingRef.current = false;
      setLocalPercent(null);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingPercentRef.current = null;
    }
  }, [readOnly, selectedIds.length, unlocked.length]);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const p = pendingPercentRef.current;
    pendingPercentRef.current = null;
    if (p != null) applyScalePercent(p);
    setLocalPercent(null);
  }, []);

  useEffect(() => {
    const onWinPointerEnd = () => endDrag();
    window.addEventListener('pointerup', onWinPointerEnd);
    window.addEventListener('pointercancel', onWinPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onWinPointerEnd);
      window.removeEventListener('pointercancel', onWinPointerEnd);
    };
  }, [endDrag]);

  const scheduleApply = useCallback((percent: number) => {
    pendingPercentRef.current = percent;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const latest = pendingPercentRef.current;
      if (latest != null) applyScalePercent(latest);
    });
  }, []);

  const { sliderRef, handleInputChange } = useIntentionalSliderDrag(
    (v) => {
      bumpInteracting();
      setLocalPercent(v);
      scheduleApply(v);
    },
    {
      onDragStart: () => {
        bumpInteracting();
        draggingRef.current = true;
      },
      onDragEnd: () => {
        endDrag();
      },
    }
  );

  if (readOnly || selectedIds.length === 0 || unlocked.length === 0) return null;

  const sliderValue = localPercent ?? storeSliderPercent;

  const handlePointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    bumpInteracting();
    draggingRef.current = true;
    const v = parseFloat((e.target as HTMLInputElement).value);
    setLocalPercent(v);
    pendingPercentRef.current = v;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLInputElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    endDrag();
  };

  const label =
    Math.abs(sliderValue - Math.round(sliderValue)) < STEP / 2
      ? `${Math.round(sliderValue)}%`
      : `${sliderValue.toFixed(1)}%`;

  return (
    <div
      className={[
        'pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+3.5rem)] left-1/2 z-[42] flex -translate-x-1/2 flex-row items-center gap-2 lg:pointer-events-auto lg:absolute lg:left-2 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:flex-col lg:gap-0.5',
        interacting ? 'opacity-100' : 'opacity-[0.35] hover:opacity-90',
        'transition-[opacity] duration-700 ease-in-out',
      ].join(' ')}
    >
      <div
        className="pointer-events-auto relative flex h-10 w-[min(80vw,14rem)] items-center justify-center rounded-full bg-zinc-100/85 px-1 shadow-lg shadow-zinc-900/10 backdrop-blur-sm lg:h-[min(46vh,14rem)] lg:w-10 dark:bg-zinc-900/85 dark:shadow-black/30"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={bumpInteracting}
      >
        <label htmlFor="poster-mobile-scale-fader" className="sr-only">
          Scale selected elements
        </label>
        <input
          ref={sliderRef}
          id="poster-mobile-scale-fader"
          type="range"
          min={MIN_P}
          max={MAX_P}
          step={STEP}
          value={sliderValue}
          onChange={handleInputChange}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute h-9 w-full max-w-[200px] cursor-grab touch-pan-y accent-amber-500 transition-[filter] duration-150 ease-out active:cursor-grabbing active:brightness-110 lg:w-[min(42vh,12.5rem)] lg:-rotate-90 dark:accent-amber-400"
        />
      </div>
      <span className="pointer-events-none text-[10px] font-medium tabular-nums text-zinc-500 transition-[opacity] duration-300 ease-out dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}
