import type { NormalizedCrop } from './cropPosterAsset';

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampNormalizedCrop(crop: NormalizedCrop, minWidth = 0, minHeight = 0): NormalizedCrop {
  const width = clamp(crop.width, minWidth, 1);
  const height = clamp(crop.height, minHeight, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
}

export function moveNormalizedCrop(crop: NormalizedCrop, dx: number, dy: number): NormalizedCrop {
  return clampNormalizedCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
}

export function resizeNormalizedCrop(
  crop: NormalizedCrop,
  handle: CropHandle,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number,
): NormalizedCrop {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - minWidth);
  if (handle.includes('e')) right = clamp(right + dx, left + minWidth, 1);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minHeight);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function zoomForCrop(crop: NormalizedCrop, imageWidth: number, imageHeight: number, fitScale: number): number {
  const smallerSide = Math.min(crop.width * imageWidth, crop.height * imageHeight) * fitScale;
  return clamp(Math.ceil(144 / Math.max(1, smallerSide)), 1, 16);
}
