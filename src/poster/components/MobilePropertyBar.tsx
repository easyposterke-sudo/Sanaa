import { useState } from 'react';
import { usePosterStore } from '../store/posterStore';
import { PosterRightSidebar } from './PosterRightSidebar';

interface MobilePropertyBarProps {
  readOnly?: boolean;
  onOpenEdit3D?: (id: string) => void;
}

export function MobilePropertyBar({ readOnly = false, onOpenEdit3D }: MobilePropertyBarProps) {
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const elements = usePosterStore((s) => s.elements);
  const [expanded, setExpanded] = useState(false);

  const hasSelection = selectedIds.length > 0;
  const hasElements = elements.length > 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
      {/* Toggle handle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-2 border-t border-zinc-700 bg-zinc-900/95 px-3 py-1.5 backdrop-blur"
      >
        <div className="h-1 w-8 rounded-full bg-zinc-600" />
        <span className="text-[11px] font-medium text-zinc-400">
          {hasSelection ? 'Properties' : 'Canvas'}
        </span>
        <svg
          className={`h-3 w-3 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Expandable panel with the full right sidebar content */}
      {expanded && (
        <div
          className="max-h-[45vh] overflow-y-auto overscroll-y-contain border-t border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <PosterRightSidebar readOnly={readOnly} onOpenEdit3D={onOpenEdit3D} />
        </div>
      )}
    </div>
  );
}
