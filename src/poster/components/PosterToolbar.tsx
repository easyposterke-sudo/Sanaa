import { memo } from 'react';
import { usePosterStore } from '../store/posterStore';
import type { PosterTool } from '../store/posterStore';

interface ToolButton {
  id: PosterTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: ToolButton[] = [
  {
    id: 'select',
    label: 'Selection Tool',
    shortcut: 'V',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M7 2l12 11.2-5.8.8 3.3 6.7-2.2 1.1-3.4-6.6L7 19z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'direct',
    label: 'Direct Selection',
    shortcut: 'A',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M7 2l12 11.2-5.8.8 3.3 6.7-2.2 1.1-3.4-6.6L7 19z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'pen',
    label: 'Pen Tool',
    shortcut: 'P',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l5 5" />
      </svg>
    ),
  },
  {
    id: 'text',
    label: 'Text Tool',
    shortcut: 'T',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
      </svg>
    ),
  },
  {
    id: 'object-selection',
    label: 'Object Selection',
    shortcut: 'W',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: 'blur-brush',
    label: 'Localized Blur Brush',
    shortcut: 'B',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="9" r="5" fill="currentColor" opacity="0.9" />
        <circle cx="15.5" cy="9.5" r="4.5" fill="currentColor" opacity="0.45" />
        <circle cx="12" cy="15.5" r="4.5" fill="currentColor" opacity="0.65" />
      </svg>
    ),
  },
  {
    id: 'hand',
    label: 'Hand Tool',
    shortcut: 'H',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v10" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.82-2.82L7 15" />
      </svg>
    ),
  },
];

export const PosterToolbar = memo(function PosterToolbar() {
  const activeTool = usePosterStore((s) => s.activeTool);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);
  const objectSelectionMode = usePosterStore((s) => s.objectSelectionMode);
  const setObjectSelectionMode = usePosterStore((s) => s.setObjectSelectionMode);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const elements = usePosterStore((s) => s.elements);
  const blurBrushSize = usePosterStore((s) => s.blurBrushSize);
  const setBlurBrushSize = usePosterStore((s) => s.setBlurBrushSize);
  const blurBrushStrength = usePosterStore((s) => s.blurBrushStrength);
  const setBlurBrushStrength = usePosterStore((s) => s.setBlurBrushStrength);
  const hasSelectedImage =
    selectedIds.length === 1 &&
    elements.find((element) => element.id === selectedIds[0])?.type === 'image';

  const handleToolClick = (toolId: PosterTool) => {
    setActiveTool(toolId);
  };

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+3.75rem)] left-1/2 -translate-x-1/2 z-40 flex flex-row lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:flex-col gap-1 p-1 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl backdrop-blur-md">
      {TOOLS.map((tool) => {
        const disabled = tool.id === 'blur-brush' && !hasSelectedImage;
        return (
          <div key={tool.id} className="relative">
            <button
              type="button"
              onClick={() => handleToolClick(tool.id)}
              disabled={disabled}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors lg:h-10 lg:w-10 ${
                activeTool === tool.id
                  ? 'bg-[#1b7340] text-white shadow-inner'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
              title={
                disabled
                  ? 'Select one image before using the blur brush'
                  : `${tool.label} (${tool.shortcut})`
              }
            >
              {tool.icon}

              <div className="absolute right-full z-50 mr-2 hidden items-center whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
                {tool.label}
                <span className="ml-2 rounded bg-zinc-800 px-1 text-zinc-400">
                  {tool.shortcut}
                </span>
              </div>
            </button>

            {tool.id === 'object-selection' && activeTool === 'object-selection' && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 lg:bottom-auto lg:top-0 lg:mb-0 lg:right-full lg:mr-4 lg:left-auto lg:translate-x-0 flex flex-wrap justify-center items-center w-max max-w-[calc(100vw-2rem)] gap-1 p-1 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg backdrop-blur-sm z-50">
              {(['rectangle', 'lasso', 'magnetic', 'ai'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setObjectSelectionMode(mode);
                  }}
                  className={`px-1.5 py-1 sm:px-2 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold rounded ${
                    objectSelectionMode === mode
                      ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            )}

            {tool.id === 'blur-brush' && activeTool === 'blur-brush' && (
              <div className="absolute bottom-full left-1/2 z-50 mb-2 flex w-56 -translate-x-1/2 flex-col gap-2 rounded-md border border-zinc-200 bg-white/95 p-3 text-zinc-700 shadow-lg backdrop-blur-sm lg:bottom-auto lg:left-auto lg:right-full lg:top-0 lg:mb-0 lg:mr-4 lg:translate-x-0 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200">
                <label className="flex flex-col gap-1 text-[11px] font-medium">
                  Brush size ({Math.round(blurBrushSize)})
                  <input
                    type="range"
                    min={10}
                    max={300}
                    step={2}
                    value={blurBrushSize}
                    onChange={(event) =>
                      setBlurBrushSize(Number(event.target.value))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium">
                  Blur strength ({Math.round(blurBrushStrength)}%)
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={blurBrushStrength}
                    onChange={(event) =>
                      setBlurBrushStrength(Number(event.target.value))
                    }
                  />
                </label>
                <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Paint over the area to blur. Each stroke can be undone.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
