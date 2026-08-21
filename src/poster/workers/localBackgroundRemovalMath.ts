export type LocalBackgroundRemovalModel = 'portrait' | 'general';

const PORTRAIT_SHORT_EDGE = 512;
const PORTRAIT_LONG_EDGE_LIMIT = 768;
const MODEL_SIZE_MULTIPLE = 32;

export function localModelInputSize(
  model: LocalBackgroundRemovalModel,
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('The selected image has invalid dimensions.');
  }
  if (model === 'general') return { width: 320, height: 320 };

  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(PORTRAIT_SHORT_EDGE / shortEdge, PORTRAIT_LONG_EDGE_LIMIT / longEdge);
  return {
    width: nearestModelMultiple(sourceWidth * scale),
    height: nearestModelMultiple(sourceHeight * scale),
  };
}

export function rgbaToModelTensor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  model: LocalBackgroundRemovalModel,
): Float32Array {
  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) {
    throw new Error('The local model received incomplete image pixels.');
  }

  const output = new Float32Array(pixelCount * 3);
  const means = [0.485, 0.456, 0.406] as const;
  const deviations = [0.229, 0.224, 0.225] as const;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const rgbaOffset = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const scaled = rgba[rgbaOffset + channel] / 255;
      output[channel * pixelCount + pixel] =
        model === 'portrait'
          ? scaled * 2 - 1
          : (scaled - means[channel]) / deviations[channel];
    }
  }
  return output;
}

export function normalizeModelMask(
  values: ArrayLike<number>,
  model: LocalBackgroundRemovalModel,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(values.length);
  if (values.length === 0) return result;

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  if (model === 'general') {
    for (let index = 0; index < values.length; index += 1) {
      const value = Number(values[index]);
      if (!Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  } else {
    minimum = 0;
    maximum = 1;
  }

  const span = Math.max(maximum - minimum, 1e-8);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const normalized = Number.isFinite(value) ? (value - minimum) / span : 0;
    result[index] = Math.round(Math.max(0, Math.min(1, normalized)) * 255);
  }
  return result;
}

export function inspectAlphaMask(alpha: Uint8ClampedArray): {
  minimum: number;
  maximum: number;
  foregroundRatio: number;
} {
  if (alpha.length === 0) return { minimum: 0, maximum: 0, foregroundRatio: 0 };

  let minimum = 255;
  let maximum = 0;
  let foregroundPixels = 0;
  for (const value of alpha) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    if (value > 8) foregroundPixels += 1;
  }
  return {
    minimum,
    maximum,
    foregroundRatio: foregroundPixels / alpha.length,
  };
}

function nearestModelMultiple(value: number): number {
  return Math.max(MODEL_SIZE_MULTIPLE, Math.round(value / MODEL_SIZE_MULTIPLE) * MODEL_SIZE_MULTIPLE);
}
