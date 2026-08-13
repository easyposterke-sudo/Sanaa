import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  startTransition,
} from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

function subscribeMinWidth1024(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(min-width: 1024px)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getMinWidth1024Snapshot() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}

/** `#RRGGBB` for `<input type="color">` (no alpha). */
function normalizeHexForColorInput(raw: string): string {
  let h = raw.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  const body = h.slice(1).replace(/[^0-9A-Fa-f]/g, '');
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
  }
  if (body.length >= 6) {
    return `#${body.slice(0, 6)}`.toLowerCase();
  }
  return '#808080';
}

interface ColorPickerPopoverProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  'aria-label'?: string;
}

const NATIVE_PARENT_THROTTLE_MS = 48;

/**
 * Native color input: uncontrolled + throttled parent updates while dragging.
 * A controlled `value` + `onChange` fires every frame → Zustand + Fabric rebuilds → hang.
 */
function NativeColorPickerRow({
  color,
  onChange,
  className,
  'aria-label': ariaLabel,
}: ColorPickerPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = color.startsWith('#') ? color : `#${color}`;
  const nativeHex = normalizeHexForColorInput(hex);

  const [swatch, setSwatch] = useState(() => nativeHex);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(nativeHex);

  useEffect(() => {
    setSwatch(nativeHex);
    latestValueRef.current = nativeHex;
    const el = inputRef.current;
    if (el && el.value !== nativeHex) {
      el.value = nativeHex;
    }
  }, [nativeHex]);

  const pushToParent = (value: string, immediate: boolean) => {
    latestValueRef.current = value;
    setSwatch(value);

    if (immediate) {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      startTransition(() => onChange(value));
      return;
    }

    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
    }
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;
      const v = latestValueRef.current;
      startTransition(() => onChange(v));
    }, NATIVE_PARENT_THROTTLE_MS);
  };

  useEffect(
    () => () => {
      if (throttleTimerRef.current !== null) clearTimeout(throttleTimerRef.current);
    },
    []
  );

  return (
    <label className={`relative z-10 inline-flex cursor-pointer flex-col ${className}`}>
      <input
        ref={inputRef}
        type="color"
        defaultValue={nativeHex}
        className="sr-only"
        aria-label={ariaLabel}
        onInput={(e) => pushToParent((e.target as HTMLInputElement).value, false)}
        onChange={(e) => pushToParent((e.target as HTMLInputElement).value, true)}
      />
      <span
        className="h-9 w-12 rounded border border-zinc-200 p-0.5 dark:border-zinc-600"
        style={{ backgroundColor: swatch }}
        aria-hidden
      />
    </label>
  );
}

/**
 * Large screens: native OS color picker (throttled updates to avoid Fabric hang).
 * Small screens: react-colorful wheel in a centered sheet.
 */
export function ColorPickerPopover(props: ColorPickerPopoverProps) {
  const isLgDesktop = useSyncExternalStore(subscribeMinWidth1024, getMinWidth1024Snapshot, () => false);

  if (isLgDesktop) {
    return <NativeColorPickerRow {...props} />;
  }

  return <ColorPickerMobileSheet {...props} />;
}

function ColorPickerMobileSheet({
  color,
  onChange,
  className,
  'aria-label': ariaLabel,
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  const hex = color.startsWith('#') ? color : `#${color}`;

  const panelClass =
    'rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <div className={`relative z-10 inline-flex flex-col ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-12 cursor-pointer rounded border border-zinc-200 p-0.5 dark:border-zinc-600"
        style={{ backgroundColor: hex }}
        aria-label={ariaLabel}
      />

      {open && (
        <>
          <div
            className="fixed inset-0 z-[199] bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            ref={popoverRef}
            className={`fixed inset-x-4 top-1/2 z-[200] w-auto max-w-[min(320px,calc(100vw-2rem))] -translate-y-1/2 p-4 ${panelClass}`}
          >
            <HexColorPicker
              color={hex}
              onChange={onChange}
              className="w-full shrink-0"
              style={{ width: '100%', height: 200 }}
            />
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">#</span>
              <HexColorInput
                color={hex}
                onChange={onChange}
                prefixed={false}
                className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-lg bg-zinc-800 py-2 text-sm font-medium text-white dark:bg-zinc-200 dark:text-zinc-900"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
