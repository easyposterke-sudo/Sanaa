import { useCallback, useRef } from 'react';

export function useRafThrottle<T extends (...args: unknown[]) => void>(
  callback: T
): T {
  const rafRef = useRef<number | undefined>(undefined);
  const callbackRef = useRef<T>(callback);
  callbackRef.current = callback;

  const throttled = useCallback(
    ((...args: Parameters<T>) => {
      if (rafRef.current !== undefined) return;
      rafRef.current = requestAnimationFrame(() => {
        callbackRef.current(...args);
        rafRef.current = undefined;
      });
    }) as T,
    []
  );

  return throttled;
}
