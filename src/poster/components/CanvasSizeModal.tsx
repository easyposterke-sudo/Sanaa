import { useState } from 'react';
import {
  PAPER_PRESETS,
  SOCIAL_PRESETS,
  ASPECT_PRESETS,
  type CanvasPreset,
} from '../data/canvasPresets';

interface CanvasSizeModalProps {
  onSelect: (width: number, height: number) => void;
  onClose?: () => void;
  currentWidth?: number;
  currentHeight?: number;
  isNewProject?: boolean;
}

export function CanvasSizeModal({
  onSelect,
  onClose,
  currentWidth = 800,
  currentHeight = 600,
  isNewProject = true,
}: CanvasSizeModalProps) {
  const [customWidth, setCustomWidth] = useState(currentWidth);
  const [customHeight, setCustomHeight] = useState(currentHeight);

  const handlePresetClick = (preset: CanvasPreset) => {
    onSelect(preset.width, preset.height);
    onClose?.();
  };

  const handleCustomApply = () => {
    const w = Math.max(100, Math.min(4000, customWidth));
    const h = Math.max(100, Math.min(4000, customHeight));
    onSelect(w, h);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold">
            {isNewProject ? 'Choose your canvas size' : 'Change canvas size'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Select a preset or enter custom dimensions (pixels)
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Paper sizes
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAPER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className="flex flex-col rounded-lg border border-zinc-200 p-3 text-left transition hover:border-gold-400 hover:bg-gold-50 dark:border-zinc-700 dark:hover:border-gold-500 dark:hover:bg-gold-950/30"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Social & digital
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SOCIAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className="flex flex-col rounded-lg border border-zinc-200 p-3 text-left transition hover:border-gold-400 hover:bg-gold-50 dark:border-zinc-700 dark:hover:border-gold-500 dark:hover:bg-gold-950/30"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Aspect ratios
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className="flex flex-col rounded-lg border border-zinc-200 p-3 text-left transition hover:border-gold-400 hover:bg-gold-50 dark:border-zinc-700 dark:hover:border-gold-500 dark:hover:bg-gold-950/30"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Custom size
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={100}
                  max={4000}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 100)}
                  className="w-24 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <span className="text-zinc-500">×</span>
                <input
                  type="number"
                  min={100}
                  max={4000}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(parseInt(e.target.value, 10) || 100)}
                  className="w-24 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <span className="text-sm text-zinc-500">px</span>
              </div>
              <button
                onClick={handleCustomApply}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Apply
              </button>
            </div>
          </section>
        </div>

        {onClose && (
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
