import { useEffect } from 'react';

let activeLocks = 0;
let previousBodyOverflow = '';
let previousBodyOverscrollBehavior = '';
let previousHtmlOverflow = '';
let previousHtmlOverscrollBehavior = '';

/**
 * Keeps the document behind an open modal stationary. The reference count makes
 * this safe when one modal is temporarily displayed on top of another.
 */
export function useModalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    if (activeLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
      previousHtmlOverflow = document.documentElement.style.overflow;
      previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;

      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    }
    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks !== 0) return;

      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
    };
  }, [active]);
}
