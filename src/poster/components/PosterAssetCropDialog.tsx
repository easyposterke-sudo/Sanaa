import { useState } from 'react';
import type { ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PreparedPosterImage } from '../ai/preparePosterImage';
import { cropPosterAsset, polygonCropBounds, type NormalizedCrop, type NormalizedPoint, type PosterAssetCutout } from '../ai/cropPosterAsset';
import type { ReconstructionImageReplacement } from '../ai/compilePosterReconstruction';

export function PosterAssetCropDialog({ reference, item, onCancel, onApply }: {
  reference: PreparedPosterImage;
  item: ReconstructionElement;
  onCancel: () => void;
  onApply: (replacement: ReconstructionImageReplacement, crop: NormalizedCrop) => void;
}) {
  const [tool, setTool] = useState<'rectangle' | 'circle' | 'pen'>('rectangle');
  const [crop, setCrop] = useState<NormalizedCrop>(() => ({
    x: Math.max(0, item.box.x),
    y: Math.max(0, item.box.y),
    width: Math.min(item.box.width, 1 - Math.max(0, item.box.x)),
    height: Math.min(item.box.height, 1 - Math.max(0, item.box.y)),
  }));
  const [start, setStart] = useState<NormalizedPoint | null>(null);
  const [penPoints, setPenPoints] = useState<NormalizedPoint[]>([]);
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
    if (tool === 'pen') {
      setPenPoints((points) => {
        const last = points.at(-1);
        return last && Math.hypot(end.x - last.x, end.y - last.y) < 0.004 ? points : [...points, end];
      });
      return;
    }
    if (tool === 'circle' && event.shiftKey) {
      const diameter = Math.min(Math.abs(end.x - start.x) * reference.width, Math.abs(end.y - start.y) * reference.height);
      const width = diameter / reference.width;
      const height = diameter / reference.height;
      setCrop({ x: start.x - (end.x < start.x ? width : 0), y: start.y - (end.y < start.y ? height : 0), width, height });
    } else {
      setCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
    }
  };
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const selectedCrop = tool === 'pen' ? polygonCropBounds(penPoints) : crop;
      if (selectedCrop.width < 0.005 || selectedCrop.height < 0.005) throw new Error('Choose a larger area of the poster.');
      const cutout: PosterAssetCutout | undefined = tool === 'circle'
        ? { kind: 'ellipse' }
        : tool === 'pen' ? { kind: 'polygon', points: penPoints } : undefined;
      onApply(await cropPosterAsset(reference, selectedCrop, removeWhite, cutout), selectedCrop);
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
        <p className="mt-1 text-xs text-zinc-500">Choose a shape, then select only the image you want. Circle and Pen make the area outside the shape transparent.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Crop shape">
          {(['rectangle', 'circle', 'pen'] as const).map((shape) => (
            <button key={shape} type="button" onClick={() => { setTool(shape); setStart(null); setPenPoints([]); setError(null); }}
              aria-pressed={tool === shape}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${tool === shape ? 'border-violet-600 bg-violet-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
              {shape === 'pen' ? 'Pen' : shape === 'circle' ? 'Circle / ellipse' : 'Rectangle'}
            </button>
          ))}
          {tool === 'pen' && <button type="button" onClick={() => setPenPoints((points) => points.slice(0, -1))} disabled={!penPoints.length} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Undo point</button>}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{tool === 'pen' ? 'Click points or drag along the edge of the object. The last point joins the first; use Undo point to correct the outline.' : tool === 'circle' ? 'Drag over the object. Hold Shift for a perfect circle.' : 'Drag across the poster to adjust the selection.'}</p>
        <div className="mt-3 min-h-0 overflow-y-auto">
          <div
            className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none"
            onPointerDown={(event) => { const next = point(event); setStart(next); event.currentTarget.setPointerCapture(event.pointerId); if (tool === 'pen') setPenPoints((points) => [...points, next]); else setCrop({ ...next, width: 0, height: 0 }); }}
            onPointerMove={move}
            onPointerUp={(event) => { move(event); setStart(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => setStart(null)}
          >
            <img src={reference.dataUrl} alt="Source poster for selecting a crop" className="block max-h-[65dvh] max-w-full" draggable={false} />
            {tool === 'pen' ? (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                {penPoints.length > 1 && <polygon points={penPoints.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')} fill={penPoints.length >= 3 ? 'rgba(139,92,246,.25)' : 'none'} stroke="#a78bfa" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                {penPoints.map(({ x, y }, index) => <circle key={index} cx={x * 1000} cy={y * 1000} r="5" fill="#7c3aed" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
              </svg>
            ) : <div className={`pointer-events-none absolute border-2 border-violet-400 bg-violet-400/20 ${tool === 'circle' ? 'rounded-full' : ''}`} style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}
          </div>
        </div>
        {item.imageRole === 'logo' && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={removeWhite} onChange={(event) => setRemoveWhite(event.target.checked)} /> Make connected white background transparent</label>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={busy || (tool === 'pen' ? penPoints.length < 3 : crop.width < 0.005 || crop.height < 0.005)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Cropping…' : tool === 'rectangle' ? 'Use this crop' : 'Use this cutout'}</button>
        </div>
      </div>
    </div>
  );
}
