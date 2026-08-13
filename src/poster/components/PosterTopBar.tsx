import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import { usePosterStore } from '../store/posterStore';
import { getFabricCanvasRef } from '../canvasRef';
import {
  exportPosterPng,
  getPosterExportPlan,
  type ExportProgress,
} from '../utils/exportPoster';
import { attachRecordingExportIfEligible } from '../../recording/recordingEvidence';
import { useDesignRecorderStore } from '../../recording/recordingStore';
// Cloud save is handled by PosterLayout (Save button).

interface PosterTopBarProps {
  readOnly?: boolean;
  onOpenCanvasSize?: () => void;
  /** Save project to cloud (when logged in). */
  onSaveToCloud?: () => void;
  /** True when there are unsaved changes since last cloud save. */
  cloudDirty?: boolean;
  /** True while save-to-cloud is in progress. */
  savingToCloud?: boolean;
  /** Sidebar toggle state and callbacks (for responsive layout). */
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}

export function PosterTopBar({
  readOnly = false,
  onOpenCanvasSize,
  onSaveToCloud,
  cloudDirty = false,
  savingToCloud = false,
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeftSidebar,
  onToggleRightSidebar,
}: PosterTopBarProps = {}) {
  const navigate = useNavigate();
  const undo = usePosterStore((s) => s.undo);
  const redo = usePosterStore((s) => s.redo);
  const history = usePosterStore((s) => s.history);
  const historyIndex = usePosterStore((s) => s.historyIndex);
  const getProject = usePosterStore((s) => s.getProject);
  const loadProject = usePosterStore((s) => s.loadProject);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const canvasZoom = usePosterStore((s) => s.canvasZoom);
  const setCanvasZoom = usePosterStore((s) => s.setCanvasZoom);
  const setCanvasZoomFit = usePosterStore((s) => s.setCanvasZoomFit);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  const handleExport = useCallback(async (scale: number = 2) => {
    setExporting(true);
    setExportError(null);
    setExportProgress('preparing');
    setExportOpen(false);
    try {
      const fabricCanvas = getFabricCanvasRef();
      if (!fabricCanvas) throw new Error('The poster canvas is not ready yet.');
      const surfaceState = getProject();
      const result = await exportPosterPng({
        fabricCanvas,
        canvasWidth,
        canvasHeight,
        canvasBackground,
        scale,
        onProgress: setExportProgress,
      });
      await attachRecordingExportIfEligible(
        result.blob,
        {
          surface: 'poster',
          source: 'poster-export',
          fileName: result.filename,
          width: result.width,
          height: result.height,
          scale: result.scale,
        },
        surfaceState,
        useDesignRecorderStore.getState
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The poster could not be exported.';
      console.error('Poster export failed:', error);
      setExportError(message);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [canvasWidth, canvasHeight, canvasBackground, getProject]);

  const exportOptions = [
    { scale: 2, label: 'Standard', description: 'Good for web and social media' },
    { scale: 4, label: 'High resolution', description: 'Good for most printing' },
    { scale: 8, label: 'Maximum detail', description: 'Available when the output fits safely in memory' },
  ].map((option) => ({
    ...option,
    plan: getPosterExportPlan(canvasWidth, canvasHeight, option.scale),
  }));

  const handleSave = useCallback(() => {
    const project = getProject();
    const json = JSON.stringify(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poster-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getProject]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const project = JSON.parse(reader.result as string);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('poster_edit_my_project_id');
            sessionStorage.removeItem('poster_edit_my_project_updated_at');
          }
          loadProject(project);
        } catch (err) {
          console.error('Failed to load project', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadProject]);

  const handleNewProject = useCallback(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('poster_edit_my_project_id');
      sessionStorage.removeItem('poster_edit_my_project_updated_at');
    }
    loadProject({
      elements: [],
      canvasWidth: 800,
      canvasHeight: 600,
      canvasBackground: { type: 'solid', color: '#ffffff' },
    });
    onOpenCanvasSize?.();
  }, [loadProject, onOpenCanvasSize]);

  const guard = useCallback(
    (fn: () => void) => () => {
      if (readOnly) {
        navigate('/login');
        return;
      }
      fn();
    },
    [readOnly, navigate]
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-2 sm:px-3">
      {/* ── Sidebar toggles (mobile/tablet) ── */}
      {onToggleLeftSidebar && (
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          className={`rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden ${leftSidebarOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
          title="Toggle left panel"
          aria-label="Toggle left panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* ── Home link ── */}
      <Link
        to="/"
        className="hidden rounded p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:block"
        title="Go to Home"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </Link>

      {/* ── Back to 3D (icon on mobile, text on sm+) ── */}
      <Link
        to="/3d"
        className="hidden rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:block"
        title="Go to 3D Text Editor"
      >
        <span className="hidden md:inline">← 3D Text</span>
        <span className="md:hidden">← 3D</span>
      </Link>

      <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />

      {/* ── Undo / Redo ── */}
      <button
        onClick={guard(undo)}
        disabled={!canUndo}
        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button
        onClick={guard(redo)}
        disabled={!canRedo}
        className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
      </button>

      {/* ── Secondary actions (hidden on small screens) ── */}
      <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 md:block" />
      <button
        onClick={guard(handleNewProject)}
        className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        title="Start a new blank project"
      >
        New
      </button>
      <button
        onClick={guard(handleSave)}
        className="hidden rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:block"
        title="Download as JSON file"
      >
        <span className="hidden lg:inline">Download JSON</span>
        <span className="lg:hidden">↓ JSON</span>
      </button>
      <button
        onClick={guard(handleLoad)}
        className="hidden rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:block"
      >
        Load JSON
      </button>

      {/* Cloud save */}
      {onSaveToCloud && (
        <button
          type="button"
          onClick={onSaveToCloud}
          disabled={savingToCloud}
          className={`rounded px-2 py-1 text-sm font-medium ${
            cloudDirty
              ? 'bg-accent-600 text-white hover:bg-accent-500'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          } disabled:opacity-50`}
          title={cloudDirty ? 'Save your work to the cloud' : 'Saved to cloud'}
        >
          {savingToCloud ? 'Saving…' : cloudDirty ? 'Save' : 'Saved'}
        </button>
      )}

      {/* Canvas size */}
      {onOpenCanvasSize && (
        <button
          onClick={guard(onOpenCanvasSize)}
          className="hidden rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:block"
          title="Change canvas size"
        >
          <span className="font-mono text-xs">{canvasWidth}×{canvasHeight}</span>
        </button>
      )}

      {/* Zoom controls */}
      <div className="hidden items-center gap-0.5 md:flex">
        <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          onClick={() => setCanvasZoom(canvasZoom - 0.25)}
          className="rounded px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={setCanvasZoomFit}
          className="min-w-[3.5rem] rounded px-1.5 py-1 text-center font-mono text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Fit to view"
        >
          {canvasZoom === 1 ? 'Fit' : `${Math.round(canvasZoom * 100)}%`}
        </button>
        <button
          onClick={() => setCanvasZoom(canvasZoom + 0.25)}
          className="rounded px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      <ThemeToggle size="md" />

      <div className="relative" ref={exportMenuRef}>
        <button
          onClick={guard(() => setExportOpen((o) => !o))}
          disabled={exporting}
          className="flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50 sm:px-4 sm:text-sm"
        >
          {exporting
            ? exportProgress === 'encoding'
              ? 'Encoding…'
              : exportProgress === 'downloading'
                ? 'Downloading…'
                : 'Rendering…'
            : 'Export PNG'}
          <svg
            className={`h-4 w-4 transition-transform ${exportOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {exportOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Export Resolution
            </div>
            {exportOptions.map(({ scale, label, description, plan }) => (
              <button
                key={scale}
                type="button"
                onClick={guard(() => void handleExport(scale))}
                disabled={!plan.safe}
                title={plan.reason}
                className="flex w-full flex-col px-4 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-zinc-700"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {label} · {scale}×
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {plan.width.toLocaleString()}×{plan.height.toLocaleString()} px · {Math.round(plan.rawMemoryMiB)} MiB/buffer
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {plan.safe ? description : plan.reason}
                </span>
              </button>
            ))}
          </div>
        )}
        {exportError && (
          <div
            role="alert"
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <div className="flex items-start gap-2">
              <span className="flex-1">{exportError}</span>
              <button
                type="button"
                onClick={() => setExportError(null)}
                className="font-semibold"
                aria-label="Dismiss export error"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

    </header>
  );
}
