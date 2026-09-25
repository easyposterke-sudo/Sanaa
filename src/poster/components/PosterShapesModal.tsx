import type { PosterShapePresetId } from '../posterShapePresets';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface PosterShapesModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (id: PosterShapePresetId) => void;
}

const SHAPES: { id: PosterShapePresetId; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'rounded-rect', label: 'Rounded rectangle' },
  { id: 'rect-two-round', label: 'Rectangle (2 round)' },
  { id: 'circle', label: 'Circle' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
  { id: 'star', label: 'Star' },
  { id: 'pentagon', label: 'Pentagon' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'bezier-path', label: 'Bezier Path' },
];

export function PosterShapesModal({ open, onClose, onPick }: PosterShapesModalProps) {
  useModalScrollLock(open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-shapes-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] dark:bg-zinc-900">
        <div className="shrink-0 border-b border-zinc-200 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-700">
          <h2 id="poster-shapes-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Shapes
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onPick(s.id);
                  onClose();
                }}
                className="flex flex-col items-start rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-left transition hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-amber-500 dark:hover:bg-amber-950/30"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200 p-3 sm:px-5 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
