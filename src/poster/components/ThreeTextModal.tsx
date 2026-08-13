import { useEffect, useState, useCallback } from 'react';
import { getEditorRecordingSnapshot, useEditorStore } from '../../store/editorStore';
import { usePosterStore } from '../store/posterStore';
import { Canvas } from '../../components/canvas/Canvas';
import { RightSidebar } from '../../components/sidebar/RightSidebar';
import { LeftSidebar } from '../../components/sidebar/LeftSidebar';
import { serializeEditorState } from '../utils/serializeEditorState';
import { loadFontsForPosterElements } from '../loadPosterFonts';
import type { Poster3DTextElement } from '../types';
import { attachRecordingDataUrlExportIfEligible } from '../../recording/recordingEvidence';
import { useDesignRecorderStore } from '../../recording/recordingStore';

interface ThreeTextModalProps {
  mode: 'add' | { editId: string };
  onClose: () => void;
  onSendToPoster: (image: string, config: Poster3DTextElement['config']) => void;
  onEditComplete: (image: string, config: Poster3DTextElement['config']) => void;
}

export function ThreeTextModal({
  mode,
  onClose,
  onSendToPoster,
  onEditComplete,
}: ThreeTextModalProps) {
  const loadPoster3DConfig = useEditorStore((s) => s.loadPoster3DConfig);
  const renderEngine = useEditorStore((s) => s.renderEngine);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const updateElement = usePosterStore((s) => s.updateElement);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [canvasRemountKey, setCanvasRemountKey] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [mobilePropsExpanded, setMobilePropsExpanded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setLeftOpen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body scroll when sidebar drawer is open on mobile
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop || !leftOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [leftOpen]);

  useEffect(() => {
    if (mode === 'add') {
      loadPoster3DConfig({});
      setCanvasRemountKey((k) => k + 1);
      return;
    }
    if (typeof mode === 'object' && 'editId' in mode) {
      const el = usePosterStore.getState().elements.find((e) => e.id === mode.editId);
      if (el && el.type === '3d-text') {
        const e3d = el as Poster3DTextElement;
        // Ensure fonts are in cache before mounting 3D canvas
        void loadFontsForPosterElements([e3d]).finally(() => {
          loadPoster3DConfig(e3d.config);
          setCanvasRemountKey((k) => k + 1);
        });
      }
    }
  }, [mode, loadPoster3DConfig]);

  const handleSend = useCallback(async () => {
    setSendError(null);
    setSending(true);
    try {
      const api = useEditorStore.getState().webglExportAPI;
      if (!api) {
        setSendError('3D preview is still loading. Please wait a moment and try again.');
        return;
      }
      const HI_RES_SCALE = 2;
      const dataUrl = api.toDataURL(HI_RES_SCALE);
      if (!dataUrl) {
        setSendError('Could not export the 3D image. Please try again.');
        return;
      }
      const recordingState = getEditorRecordingSnapshot();
      const config = serializeEditorState();
      if (mode === 'add') {
        onSendToPoster(dataUrl, config);
      } else {
        const editId = mode.editId;
        updateElement(editId, { image: dataUrl, config, userPosterImageId: undefined });
        onEditComplete(dataUrl, config);
      }
      await attachRecordingDataUrlExportIfEligible(
        dataUrl,
        {
          surface: 'three',
          source: 'send-to-poster',
          fileName: 'metallic-text-to-poster.webp',
          scale: HI_RES_SCALE,
          quality: 0.85,
          transparent: true,
        },
        recordingState,
        useDesignRecorderStore.getState
      );
    } catch {
      setSendError('Failed to send 3D text to poster. Please try again.');
    } finally {
      setSending(false);
    }
  }, [mode, onSendToPoster, onEditComplete, updateElement]);

  useEffect(() => {
    if (renderEngine !== 'webgl') {
      useEditorStore.getState().setState({ renderEngine: 'webgl' });
    }
  }, [renderEngine]);

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
    <div className="fixed inset-0 z-50 flex flex-col overscroll-none bg-white dark:bg-zinc-900">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-zinc-200 px-2 dark:border-zinc-800 sm:px-4">
        {/* Left sidebar toggle — mobile only */}
        <button
          type="button"
          onClick={() => setLeftOpen((v) => !v)}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 ${leftOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle panels"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h2 className="text-sm font-semibold sm:text-base">
          {mode === 'add' ? '3D Text' : 'Edit 3D'}
        </h2>

        {/* Undo / Redo */}
        <button type="button" onClick={undo} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" title="Undo">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
        </button>
        <button type="button" onClick={redo} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" title="Redo">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSend}
          disabled={sending}
          className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 sm:px-4 sm:py-1.5 sm:text-sm"
        >
          {mode === 'add' ? (sending ? 'Sending…' : 'Send to Poster') : (sending ? 'Updating…' : 'Update')}
        </button>
        <button
          onClick={onClose}
          className="rounded border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-100 sm:px-4 sm:py-1.5 sm:text-sm dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </header>

      {sendError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {sendError}
        </div>
      )}

      {/* Mobile backdrop for left sidebar */}
      {leftOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setLeftOpen(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar — drawer on mobile, inline on desktop */}
        <aside
          className={[
            'flex flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out',
            'lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-56 lg:shrink-0 lg:translate-x-0 lg:transform-none lg:transition-none',
            leftOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <LeftSidebar force3dLayerUI onPosterEditorClick={onClose} />
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-zinc-100 p-2 pb-12 sm:p-4 sm:pb-12 lg:pb-4 dark:bg-zinc-950">
          <div className="h-full w-full max-w-2xl">
            <Canvas key={canvasRemountKey} forceMultiLayer orbitZoomScale={1.5} />
          </div>
        </main>

        {/* Right sidebar — hidden on mobile, inline on desktop */}
        <aside className="hidden overflow-y-auto overscroll-y-contain border-l border-zinc-200 bg-white lg:flex lg:w-60 lg:shrink-0 lg:flex-col dark:border-zinc-800 dark:bg-zinc-900">
          <RightSidebar force3dLayerUI />
        </aside>
      </div>

      {/* Mobile bottom property bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePropsExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-2 border-t border-zinc-200 bg-white/95 px-3 py-1.5 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
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
          <div className="max-h-[50vh] overflow-y-auto overscroll-y-contain border-t border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <RightSidebar force3dLayerUI />
          </div>
        )}
      </div>
    </div>
  );
}
