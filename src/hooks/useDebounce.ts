import { useEffect, useRef, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const callbackRef = useRef<T>(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const argsRef = useRef<Parameters<T> | undefined>(undefined);

  callbackRef.current = callback;

  const debounced = ((...args: Parameters<T>) => {
    argsRef.current = args;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (argsRef.current) callbackRef.current(...argsRef.current);
    }, delay);
  }) as T;

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return debounced;
}
