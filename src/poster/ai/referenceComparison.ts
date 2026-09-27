import type { PosterReconstructionPlan, ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import { isProtectedReferenceElement } from '../../../shared/ai/referenceReconstructionContract';

export interface ReferencePixelImage { width: number; height: number; data: Uint8ClampedArray }
export interface ReferenceRegionScore { key: string; error: number; samples: number }
export interface ReferenceComparison { error: number; regions: ReferenceRegionScore[] }

/** Region-weighted visual error, not a promise of text correctness or perceptual equivalence. */
export function compareReferencePixels(reference: ReferencePixelImage, draft: ReferencePixelImage, regions: ReconstructionElement[], protectedLayers: ReconstructionElement[]): ReferenceComparison {
  if (reference.width !== draft.width || reference.height !== draft.height || reference.data.length !== draft.data.length) throw new Error('Comparison images must have identical dimensions.');
  const { width, height } = reference;
  const results: ReferenceRegionScore[] = [];
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 640));
  for (const region of regions) {
    if (isProtectedReferenceElement(region)) continue;
    const { box } = region;
    const left = Math.max(1, Math.floor(box.x * width) - 2);
    const top = Math.max(1, Math.floor(box.y * height) - 2);
    const right = Math.min(width - 1, Math.ceil((box.x + box.width) * width) + 2);
    const bottom = Math.min(height - 1, Math.ceil((box.y + box.height) * height) + 2);
    let error = 0; let samples = 0;
    for (let y = top; y < bottom; y += sampleStep) {
      for (let x = left; x < right; x += sampleStep) {
        // Foreground replacements may intentionally occlude vector elements. Backgrounds
        // behind text are not excluded, otherwise a full-page photo would mask all text.
        if (protectedLayers.some(layer => layer.zIndex > region.zIndex && inside(x / width, y / height, layer))) continue;
        const index = (y * width + x) * 4;
        let color = 0; let edge = 0;
        for (let channel = 0; channel < 3; channel++) {
          color += Math.abs(reference.data[index + channel]! - draft.data[index + channel]!);
          const offset = index + channel;
          const referenceEdge = Math.abs(reference.data[offset + 4]! - reference.data[offset - 4]!) + Math.abs(reference.data[offset + width * 4]! - reference.data[offset - width * 4]!);
          const draftEdge = Math.abs(draft.data[offset + 4]! - draft.data[offset - 4]!) + Math.abs(draft.data[offset + width * 4]! - draft.data[offset - width * 4]!);
          edge += Math.abs(referenceEdge - draftEdge);
        }
        error += 0.45 * color / 765 + 0.55 * edge / 1530;
        samples++;
      }
    }
    if (samples > 0) results.push({ key: region.key, error: error / samples, samples });
  }
  return { error: results.length ? results.reduce((sum, value) => sum + value.error, 0) / results.length : 0, regions: results };
}

function inside(x: number, y: number, layer: ReconstructionElement): boolean {
  return x >= layer.box.x && y >= layer.box.y && x <= layer.box.x + layer.box.width && y <= layer.box.y + layer.box.height;
}

/** Evaluate both drafts over the same union of original and corrected bounds. */
export function referenceComparisonRegions(previous: PosterReconstructionPlan, candidate: PosterReconstructionPlan): ReconstructionElement[] {
  const regions = new Map(previous.elements.map(item => [item.key, item]));
  for (const item of candidate.elements) {
    const old = regions.get(item.key);
    if (!old) { regions.set(item.key, item); continue; }
    const x = Math.min(old.box.x, item.box.x); const y = Math.min(old.box.y, item.box.y);
    regions.set(item.key, { ...old, box: { x, y,
      width: Math.max(old.box.x + old.box.width, item.box.x + item.box.width) - x,
      height: Math.max(old.box.y + old.box.height, item.box.y + item.box.height) - y,
    } });
  }
  return [...regions.values()];
}

export function isReferenceImprovement(before: ReferenceComparison, after: ReferenceComparison): boolean {
  if (!before.regions.length || before.regions.length !== after.regions.length) return false;
  const old = new Map(before.regions.map(region => [region.key, region]));
  if (after.regions.some(region => !old.has(region.key) || region.error > old.get(region.key)!.error + 0.015)) return false;
  return after.error < before.error - 0.0005;
}

export async function loadReferencePixels(dataUrl: string, width: number, height: number): Promise<ReferencePixelImage> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not read the reference for comparison.')); image.src = dataUrl; });
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not compare the reference.');
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function canvasPixels(canvas: HTMLCanvasElement): ReferencePixelImage {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not compare the draft.');
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
