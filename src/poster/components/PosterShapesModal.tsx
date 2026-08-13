import type { PosterShapePresetId } from '../posterShapePresets';

interface PosterShapesModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (id: PosterShapePresetId) => void;
}

const SHAPES: { id: PosterShapePresetId; label: string; description: string }[] = [
  { id: 'rect', label: 'Rectangle', description: 'Sharp corners' },
  { id: 'rounded-rect', label: 'Rounded rectangle', description: 'All corners rounded' },
  {
    id: 'rect-two-round',
    label: 'Rectangle (2 round)',
    description: 'Top corners round, bottom sharp',
  },
  { id: 'circle', label: 'Circle', description: 'Perfect circle' },
  { id: 'triangle', label: 'Triangle', description: 'Equilateral-style' },
  { id: 'ellipse', label: 'Ellipse', description: 'Oval' },
  { id: 'line', label: 'Line', description: 'Stroke' },
  { id: 'star', label: 'Star', description: '5 points' },
  { id: 'pentagon', label: 'Pentagon', description: '5 sides' },
  { id: 'hexagon', label: 'Hexagon', description: '6 sides' },
  { id: 'diamond', label: 'Diamond', description: 'Rhombus' },
  { id: 'bezier-path', label: 'Bezier Path', description: 'Editable anchors + handles' },
];

export function PosterShapesModal({ open, onClose, onPick }: PosterShapesModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-shapes-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 id="poster-shapes-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Shapes
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Choose a shape to add to your poster
          </p>
        </div>

        <div className="max-h-[min(70vh,420px)] overflow-y-auto p-4">
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
                <span className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
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
