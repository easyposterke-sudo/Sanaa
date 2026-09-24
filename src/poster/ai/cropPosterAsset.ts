import type { ReconstructionImageReplacement } from './compilePosterReconstruction';

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint { x: number; y: number }
export type PosterAssetCutout =
  | { kind: 'ellipse' }
  | { kind: 'polygon'; points: NormalizedPoint[] };

/** Bounds of a pen outline, in poster coordinates. */
export function polygonCropBounds(points: NormalizedPoint[]): NormalizedCrop {
  if (points.length < 3) throw new Error('Place at least three points around the image.');
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Extract only the selected poster pixels. Edge-connected white can become transparent for logos. */
export async function cropPosterAsset(
  source: { dataUrl: string; width: number; height: number },
  crop: NormalizedCrop,
  removeWhite: boolean,
  cutout?: PosterAssetCutout,
): Promise<ReconstructionImageReplacement> {
  const image = new Image();
  image.src = source.dataUrl;
  await new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth) { resolve(); return; }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The poster image could not be opened for cropping.'));
  });
  const left = Math.max(0, Math.floor(crop.x * source.width));
  const top = Math.max(0, Math.floor(crop.y * source.height));
  const width = Math.min(source.width - left, Math.max(1, Math.ceil(crop.width * source.width)));
  const height = Math.min(source.height - top, Math.max(1, Math.ceil(crop.height * source.height)));
  if (width < 2 || height < 2) throw new Error('Choose a larger area of the poster.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: removeWhite });
  if (!context) throw new Error('This browser could not crop the poster.');
  context.drawImage(image, left, top, width, height, 0, 0, width, height);
  if (removeWhite) {
    const pixels = context.getImageData(0, 0, width, height);
    removeEdgeConnectedWhite(pixels);
    context.putImageData(pixels, 0, 0);
  }
  if (cutout) {
    // Keep only the pixels inside the selected shape. The transparent PNG is
    // used directly by the poster renderer, so its edge survives export.
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = '#fff';
    context.beginPath();
    if (cutout.kind === 'ellipse') {
      context.ellipse((crop.x * source.width - left) + crop.width * source.width / 2,
        (crop.y * source.height - top) + crop.height * source.height / 2,
        crop.width * source.width / 2, crop.height * source.height / 2, 0, 0, Math.PI * 2);
    } else {
      cutout.points.forEach((point, index) => {
        const x = point.x * source.width - left;
        const y = point.y * source.height - top;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    }
    context.fill();
  }
  return { src: canvas.toDataURL('image/png'), width, height, preserveOutline: Boolean(cutout) };
}

function removeEdgeConnectedWhite(image: ImageData): void {
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const add = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (data[offset] < 240 || data[offset + 1] < 240 || data[offset + 2] < 240) return;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  while (head < tail) {
    const index = queue[head++];
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(x - 1, y);
    if (x + 1 < width) add(x + 1, y);
    if (y > 0) add(x, y - 1);
    if (y + 1 < height) add(x, y + 1);
  }
}
