import type { Poster3DTextElement } from './types';

export interface RasterDimensions {
  width: number;
  height: number;
}

export interface TrimmedRaster extends RasterDimensions {
  dataUrl: string;
}

export interface AlphaBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Find non-transparent content in RGBA data. Right/bottom are inclusive. */
export function findVisibleAlphaBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 1,
): AlphaBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! < alphaThreshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < left || bottom < top ? null : { left, top, right, bottom };
}

export function readRasterDimensions(dataUrl: string): Promise<RasterDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not read the exported 3D image dimensions.'));
    image.src = dataUrl;
  });
}

/**
 * Remove the editor viewport's transparent margins while retaining a small
 * safety gutter for antialiasing and the extrusion edge.
 */
export function trimTransparentRaster(
  dataUrl: string,
  paddingRatio = 0.025,
): Promise<TrimmedRaster> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = Math.max(1, image.naturalWidth);
        source.height = Math.max(1, image.naturalHeight);
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('Could not prepare the 3D export canvas.');
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        const bounds = findVisibleAlphaBounds(pixels, source.width, source.height);
        if (!bounds) {
          resolve({ dataUrl, width: source.width, height: source.height });
          return;
        }

        const visibleWidth = bounds.right - bounds.left + 1;
        const visibleHeight = bounds.bottom - bounds.top + 1;
        const padding = Math.max(2, Math.ceil(Math.max(visibleWidth, visibleHeight) * paddingRatio));
        const left = Math.max(0, bounds.left - padding);
        const top = Math.max(0, bounds.top - padding);
        const right = Math.min(source.width - 1, bounds.right + padding);
        const bottom = Math.min(source.height - 1, bounds.bottom + padding);
        const width = right - left + 1;
        const height = bottom - top + 1;

        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const outputContext = output.getContext('2d');
        if (!outputContext) throw new Error('Could not crop the 3D export.');
        outputContext.drawImage(source, left, top, width, height, 0, 0, width, height);
        resolve({ dataUrl: output.toDataURL('image/webp', 0.9), width, height });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Could not decode the exported 3D image.'));
    image.src = dataUrl;
  });
}

export interface ReplacementGeometry {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  previewWidth: number;
  previewHeight: number;
}

/**
 * Preserve the title's current poster width, but use one uniform scale for the
 * new raster. This prevents a WebGL export from being independently squashed
 * back into the temporary preview's width and height.
 */
export function computeUniform3DTextReplacement(
  existing: Poster3DTextElement,
  next: RasterDimensions,
  previousIntrinsic: RasterDimensions,
): ReplacementGeometry {
  const nextWidth = Math.max(1, next.width);
  const nextHeight = Math.max(1, next.height);
  const previousWidth = Math.max(1, previousIntrinsic.width);
  const previousHeight = Math.max(1, previousIntrinsic.height);
  const shownWidth = previousWidth * Math.abs(existing.scaleX);
  const shownHeight = previousHeight * Math.abs(existing.scaleY);
  const uniformScale = shownWidth / nextWidth;
  const nextShownHeight = nextHeight * uniformScale;

  return {
    left: existing.left,
    top: existing.top + (shownHeight - nextShownHeight) / 2,
    scaleX: uniformScale * (existing.scaleX < 0 ? -1 : 1),
    scaleY: uniformScale * (existing.scaleY < 0 ? -1 : 1),
    previewWidth: nextWidth,
    previewHeight: nextHeight,
  };
}
