import { useRef, useEffect, useCallback, useState } from 'react';

interface UseIntentionalSliderDragOptions {
  threshold?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * A hook to distinguish between vertical scrolling and intentional horizontal slider dragging on mobile.
 *
 * Requirements:
 * - Sliders should ONLY update when horizontal movement is dominant (dx > dy) and exceeds threshold (8px).
 * - Vertical movement should allow normal container scrolling without changing slider values.
 */
export function useIntentionalSliderDrag(
  onChange: (value: number) => void,
  options: UseIntentionalSliderDragOptions = {}
) {
  const { threshold = 8, onDragStart, onDragEnd } = options;
  const sliderRef = useRef<HTMLInputElement>(null);

  // Track start position of the touch
  const startPos = useRef<{ x: number; y: number } | null>(null);

  // Track states with refs for immediate access in event handlers
  const isDraggingRef = useRef(false);
  const isScrollingRef = useRef(false);

  // Also provide a state for UI feedback if needed
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    startPos.current = { x: touch.clientX, y: touch.clientY };
    isDraggingRef.current = false;
    isScrollingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isScrollingRef.current) return;
    if (!startPos.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);

    if (isDraggingRef.current) {
      // Already confirmed horizontal dragging: prevent default to stop page scrolling
      // BUT we must NOT call preventDefault if we want the native slider to update!
      // Actually, if we use touch-action: pan-y on the element, the browser handles
      // the discrimination itself. But the requirement is NOT to rely solely on CSS.
      // If we don't preventDefault, the page might scroll.
      // If we do preventDefault, the slider thumb won't move on some browsers.

      // Let's re-read: "Vertical movement should allow normal container scrolling WITHOUT changing slider values."
      // If we allow the event to propagate, the slider WILL change value because it's an <input type="range">.

      if (e.cancelable) e.preventDefault();

      // Since we prevented default, we must manually update the slider value
      const el = sliderRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const min = parseFloat(el.min || '0');
        const max = parseFloat(el.max || '100');
        const step = parseFloat(el.step || '1');

        // Calculate percentage across the slider
        let percent = (touch.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        const rawValue = min + percent * (max - min);
        const steppedValue = Math.round(rawValue / step) * step;
        onChange(steppedValue);
      }
      return;
    }

    // If vertical movement is dominant, treat as scroll
    if (dy > dx && dy > 5) {
      isScrollingRef.current = true;
      return;
    }

    // If horizontal movement is dominant and exceeds threshold, activate slider dragging
    if (dx > threshold && dx > dy) {
      isDraggingRef.current = true;
      setIsDragging(true);
      if (onDragStart) onDragStart();
      if (e.cancelable) e.preventDefault();

      // Initial update when threshold is crossed
      const el = sliderRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const min = parseFloat(el.min || '0');
        const max = parseFloat(el.max || '100');
        const step = parseFloat(el.step || '1');
        let percent = (touch.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        const rawValue = min + percent * (max - min);
        const steppedValue = Math.round(rawValue / step) * step;
        onChange(steppedValue);
      }
    }
  }, [threshold, onDragStart, onChange]);

  const handleTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      if (onDragEnd) onDragEnd();
    }
    startPos.current = null;
    isDraggingRef.current = false;
    isScrollingRef.current = false;
    setIsDragging(false);
  }, [onDragEnd]);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Only use native onChange for non-touch events (mouse)
    // For touch events, we handle updates manually in handleTouchMove to ensure
    // we only update after horizontal intent is confirmed.

    // We can detect touch by checking if startPos is active
    if (startPos.current === null) {
      onChange(parseFloat(e.target.value));
    }
  }, [onChange]);

  return {
    sliderRef,
    isDragging,
    handleInputChange,
  };
}
