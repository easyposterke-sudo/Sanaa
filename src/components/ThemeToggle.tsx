import { useTheme } from '../hooks/useTheme';

type ThemeToggleProps = {
  /** Slightly larger hit target for the poster top bar */
  size?: 'sm' | 'md';
};

/**
 * Single accessible light/dark switch (shared by 3D editor and poster editor).
 */
export function ThemeToggle({ size = 'sm' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const h = size === 'md' ? 'h-8' : 'h-7';
  const w = size === 'md' ? 'w-[3.25rem]' : 'w-11';
  const thumb = size === 'md' ? 'h-6 w-6' : 'h-5 w-5';
  /** Slide thumb to the right when dark (track width − padding − thumb) */
  const translateOn = size === 'md' ? 'translate-x-[1.5rem]' : 'translate-x-5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggleTheme}
      className={`relative ${h} ${w} shrink-0 rounded-full border border-zinc-300 bg-zinc-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-800 dark:focus-visible:ring-offset-zinc-900`}
    >
      <span
        className={`absolute left-0.5 top-1/2 ${thumb} -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-zinc-200 transition-transform duration-200 ease-out dark:bg-zinc-100 dark:ring-zinc-500 ${
          isDark ? translateOn : ''
        }`}
      />
      <span className="sr-only">{isDark ? 'Dark mode on' : 'Light mode on'}</span>
    </button>
  );
}
