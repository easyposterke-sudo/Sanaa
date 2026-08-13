import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LeftSidebar } from '../sidebar/LeftSidebar';
import { RightSidebar } from '../sidebar/RightSidebar';
import { Canvas } from '../canvas/Canvas';
import { useEditorStore } from '../../store/editorStore';
import { DesignRecorderPanel } from '../../recording/DesignRecorderPanel';

export function AppLayout() {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [mobilePropsExpanded, setMobilePropsExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setLeftOpen(e.matches);
      setRightOpen(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body scroll when mobile sidebar drawer is open
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop || !leftOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [leftOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isTypingTarget =
        target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isTypingTarget) return;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (!ctrlOrMeta) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar — always visible */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Left sidebar toggle — mobile only */}
        <button
          type="button"
          onClick={() => setLeftOpen((v) => !v)}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden ${leftOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle left panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Home link */}
        <Link
          to="/"
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Home"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>

        {/* Poster Editor link */}
        <Link
          to="/poster"
          className="hidden rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 sm:inline-block dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          Poster Editor
        </Link>

        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">3D Text</span>

        {/* Undo / Redo */}
        <button type="button" onClick={undo} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" title="Undo (Ctrl+Z)">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
        </button>
        <button type="button" onClick={redo} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" title="Redo (Ctrl+Y)">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
        </button>

        <div className="flex-1" />

        {/* Right sidebar toggle — mobile only */}
        <button
          type="button"
          onClick={() => setRightOpen((v) => !v)}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden ${rightOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle properties panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>

      {/* Mobile backdrop — closes left sidebar drawer */}
      {leftOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setLeftOpen(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar — fixed drawer on mobile, inline on desktop */}
        <aside
          className={[
            'flex flex-col overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out',
            'lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-60 lg:min-w-[200px] lg:shrink-0 lg:translate-x-0 lg:transform-none lg:transition-none',
            leftOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <LeftSidebar />
          <DesignRecorderPanel compact />
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden pb-0">
          <div className="h-full w-full max-w-4xl">
            <Canvas />
          </div>
        </main>

        {/* Right sidebar — hidden on mobile, inline on desktop */}
        <aside className="hidden overflow-y-auto border-l border-zinc-200 bg-white lg:flex lg:w-60 lg:min-w-[200px] lg:shrink-0 lg:flex-col dark:border-zinc-800 dark:bg-zinc-900">
          <RightSidebar />
        </aside>
      </div>

      {/* Mobile bottom property bar — in-flow so canvas shrinks when expanded */}
      <div className="shrink-0 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePropsExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-2 border-t border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="h-1 w-8 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Properties</span>
          <svg
            className={`h-3 w-3 text-zinc-400 transition-transform dark:text-zinc-500 ${mobilePropsExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {mobilePropsExpanded && (
          <div className="max-h-[30vh] overflow-y-auto overscroll-y-contain border-t border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <RightSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
