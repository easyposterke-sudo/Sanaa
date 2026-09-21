import { useState } from 'react';
import type { ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PreparedPosterImage } from '../ai/preparePosterImage';
import { cropPosterAsset, type NormalizedCrop } from '../ai/cropPosterAsset';
import type { ReconstructionImageReplacement } from '../ai/compilePosterReconstruction';

export function PosterAssetCropDialog({ reference, item, onCancel, onApply }: {
  reference: PreparedPosterImage;
  item: ReconstructionElement;
  onCancel: () => void;
  onApply: (replacement: ReconstructionImageReplacement, crop: NormalizedCrop) => void;
}) {
  const [crop, setCrop] = useState<NormalizedCrop>(() => ({
    x: Math.max(0, item.box.x),
    y: Math.max(0, item.box.y),
    width: Math.min(item.box.width, 1 - Math.max(0, item.box.x)),
    height: Math.min(item.box.height, 1 - Math.max(0, item.box.y)),
  }));
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [removeWhite, setRemoveWhite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const end = point(event);
    setCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  };
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      onApply(await cropPosterAsset(reference, crop, removeWhite), crop);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The selected area could not be cropped.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={`Crop ${item.label} from poster`}>
      <div className="flex max-h-[95dvh] w-full max-w-2xl flex-col rounded-xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
        <h3 className="text-base font-semibold">Crop “{item.label}” from the poster</h3>
        <p className="mt-1 text-xs text-zinc-500">Drag over the poster to adjust the detected area. Keep only the image you want in this layer.</p>
        <div className="mt-3 min-h-0 overflow-y-auto">
          <div
            className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none"
            onPointerDown={(event) => { const next = point(event); setStart(next); event.currentTarget.setPointerCapture(event.pointerId); setCrop({ ...next, width: 0, height: 0 }); }}
            onPointerMove={move}
            onPointerUp={(event) => { move(event); setStart(null); event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => setStart(null)}
          >
            <img src={reference.dataUrl} alt="Source poster for selecting a crop" className="block max-h-[65dvh] max-w-full" draggable={false} />
            <div className="pointer-events-none absolute border-2 border-violet-400 bg-violet-400/20" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
          </div>
        </div>
        {item.imageRole === 'logo' && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={removeWhite} onChange={(event) => setRemoveWhite(event.target.checked)} /> Make connected white background transparent</label>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={busy || crop.width < 0.005 || crop.height < 0.005} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Cropping…' : 'Use this crop'}</button>
        </div>
      </div>
    </div>
  );
}
