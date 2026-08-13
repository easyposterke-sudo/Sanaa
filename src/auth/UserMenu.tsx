import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from './authStore';

interface UserMenuProps {
  /** When true, shows only avatar for narrow layouts (e.g. sidebar) */
  compact?: boolean;
  /** When true, avatar-only on small screens; name + chevron from md and up (saves navbar space on phones). */
  compactUntilMd?: boolean;
}

export function UserMenu({ compact = false, compactUntilMd = false }: UserMenuProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  if (!user) return null;

  const displayName = user.name || user.email;
  const truncatedName = displayName.length > 18 ? `${displayName.slice(0, 16)}…` : displayName;

  const responsiveMd = compactUntilMd && !compact;
  const triggerPadding = compact ? 'p-1.5' : responsiveMd ? 'p-1.5 md:px-3 md:py-1.5' : 'px-3 py-1.5';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:hover:border-zinc-500 ${triggerPadding}`}
        title={user.email}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-medium text-accent-700 dark:bg-accent-900/50 dark:text-accent-300">
          {displayName.charAt(0).toUpperCase()}
        </span>
        {!compact && !compactUntilMd && (
          <>
            <span className="max-w-[120px] truncate">{truncatedName}</span>
            <svg
              className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400 ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
        {responsiveMd && (
          <>
            <span className="hidden max-w-[120px] truncate md:inline">{truncatedName}</span>
            <svg
              className={`hidden h-4 w-4 shrink-0 text-zinc-500 transition-transform md:block dark:text-zinc-400 ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-2 w-56 rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${
            compact && !responsiveMd ? 'left-0' : 'right-0'
          }`}
        >
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={user.email}>
              {user.email}
            </p>
            {user.name && (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.name}</p>
            )}
            {isAdmin && (
              <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                Admin
              </span>
            )}
          </div>
          <div className="py-1">
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-indigo-600 font-medium hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
              >
                Admin Dashboard
              </Link>
            )}
            <Link
              to="/poster/templates"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Poster templates
            </Link>
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              3D Text Editor
            </Link>
          </div>
          <div className="border-t border-zinc-100 py-1 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
