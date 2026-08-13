/**
 * Height-field → tangent-space normal map (CPU, canvas-friendly).
 * Matches common Sobel/Scharr workflows similar to NormalMap-Online.
 */

export interface NormalMapGeneratorOptions {
  /** Amplifies surface tilt; typical 0.5–5 */
  strength: number;
  /** Flip height before derivatives (recess vs raised) */
  invert: boolean;
  filter: 'sobel' | 'scharr';
  /** Extra 3×3 box smooth passes (0–3) before gradients */
  blurRadius: number;
  /** Max width/height before processing; image is scaled down proportionally */
  maxSize?: number;
}

const DEFAULT_MAX_SIZE = 2048;

/** Works in browsers (native) and Vitest/Node (duck-typed buffer). */
function createOutputImageData(width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(width, height);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
}

function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function luminanceByte(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** RGBA → per-pixel height in [0, 1] */
export function rgbToHeightBuffer(imageData: ImageData, invert: boolean): Float32Array {
  const { width: w, height: h, data } = imageData;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let v = luminanceByte(data[i]!, data[i + 1]!, data[i + 2]!);
    if (invert) v = 1 - v;
    out[p] = v;
  }
  return out;
}

function sampleH(h: Float32Array, w: number, hgt: number, ix: number, iy: number): number {
  return h[iy * w + ix]!;
}

/** Single pass 3×3 box blur (average), clamped edges */
export function boxBlur3x3Once(src: Float32Array, w: number, hgt: number): Float32Array {
  const dst = new Float32Array(w * hgt);
  for (let iy = 0; iy < hgt; iy++) {
    for (let ix = 0; ix < w; ix++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = clampi(ix + dx, 0, w - 1);
          const sy = clampi(iy + dy, 0, hgt - 1);
          sum += src[sy * w + sx]!;
        }
      }
      dst[iy * w + ix] = sum / 9;
    }
  }
  return dst;
}

export function applyBoxBlurIterations(
  src: Float32Array,
  w: number,
  hgt: number,
  iterations: number
): Float32Array {
  let cur = src;
  for (let i = 0; i < iterations; i++) {
    cur = boxBlur3x3Once(cur, w, hgt);
  }
  return cur;
}

const SOBEL_KX = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 0, 1],
];
const SOBEL_KY = [
  [-1, -2, -1],
  [0, 0, 0],
  [1, 2, 1],
];

const SCHARR_KX = [
  [-3, 0, 3],
  [-10, 0, 10],
  [-3, 0, 3],
];
const SCHARR_KY = [
  [-3, -10, -3],
  [0, 0, 0],
  [3, 10, 3],
];

function convolveAt(
  h: Float32Array,
  w: number,
  hgt: number,
  ix: number,
  iy: number,
  kx: number[][],
  ky: number[][]
): { gx: number; gy: number } {
  let gx = 0;
  let gy = 0;
  for (let ky0 = -1; ky0 <= 1; ky0++) {
    for (let kx0 = -1; kx0 <= 1; kx0++) {
      const sx = clampi(ix + kx0, 0, w - 1);
      const sy = clampi(iy + ky0, 0, hgt - 1);
      const hv = h[sy * w + sx]!;
      const kk = ky0 + 1;
      const ki = kx0 + 1;
      gx += hv * kx[kk]![ki]!;
      gy += hv * ky[kk]![ki]!;
    }
  }
  return { gx, gy };
}

/**
 * Build tangent-space normals from height samples.
 * Uses N ∝ (-strength·∂h/∂u, -strength·∂h/∂v, 1) then normalize (OpenGL-style XY).
 */
export function computeNormalMapFromHeight(
  height: Float32Array,
  width: number,
  heightPx: number,
  options: Pick<NormalMapGeneratorOptions, 'strength' | 'filter'>
): ImageData {
  const { strength, filter } = options;
  const kx = filter === 'scharr' ? SCHARR_KX : SOBEL_KX;
  const ky = filter === 'scharr' ? SCHARR_KY : SOBEL_KY;

  const out = createOutputImageData(width, heightPx);
  const d = out.data;

  for (let iy = 0; iy < heightPx; iy++) {
    for (let ix = 0; ix < width; ix++) {
      const { gx, gy } = convolveAt(height, width, heightPx, ix, iy, kx, ky);
      let nx = -strength * gx;
      let ny = -strength * gy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8) {
        nx /= len;
        ny /= len;
        nz /= len;
      } else {
        nx = 0;
        ny = 0;
        nz = 1;
      }
      const o = (iy * width + ix) * 4;
      d[o] = Math.round(nx * 0.5 * 255 + 127.5);
      d[o + 1] = Math.round(ny * 0.5 * 255 + 127.5);
      d[o + 2] = Math.round(nz * 0.5 * 255 + 127.5);
      d[o + 3] = 255;
    }
  }
  return out;
}

/** Full pipeline from diffuse RGBA */
export function computeNormalMapImageData(
  imageData: ImageData,
  options: NormalMapGeneratorOptions
): ImageData {
  const blurIt = clampi(Math.round(options.blurRadius), 0, 3);
  let h = rgbToHeightBuffer(imageData, options.invert);
  h = applyBoxBlurIterations(h, imageData.width, imageData.height, blurIt);
  return computeNormalMapFromHeight(h, imageData.width, imageData.height, {
    strength: options.strength,
    filter: options.filter,
  });
}

function downscaleImageDataIfNeeded(imageData: ImageData, maxSize: number): ImageData {
  const { width: w, height: h } = imageData;
  const maxEdge = Math.max(w, h);
  if (maxEdge <= maxSize) return imageData;

  const scale = maxSize / maxEdge;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d')!.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, w, h, 0, 0, nw, nh);
  return ctx.getImageData(0, 0, nw, nh);
}

function imageDataFromImageSource(
  source: CanvasImageSource,
  maxSize: number
): ImageData {
  let w = 0;
  let h = 0;
  if (source instanceof HTMLImageElement) {
    w = source.naturalWidth;
    h = source.naturalHeight;
  } else if (source instanceof SVGImageElement) {
    w = source.width.baseVal.value;
    h = source.height.baseVal.value;
  } else if (source instanceof HTMLVideoElement) {
    w = source.videoWidth;
    h = source.videoHeight;
  } else if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    w = source.displayWidth;
    h = source.displayHeight;
  } else {
    const sized = source as { width?: number; height?: number };
    w = typeof sized.width === 'number' ? sized.width : 0;
    h = typeof sized.height === 'number' ? sized.height : 0;
  }
  if (!w || !h) {
    throw new Error('Image has no dimensions yet; wait for decode/load');
  }
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, nw, nh);
  return ctx.getImageData(0, 0, nw, nh);
}

export async function imageUrlToImageData(url: string, maxSize: number = DEFAULT_MAX_SIZE): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  if ('decode' in img && typeof img.decode === 'function') {
    try {
      await img.decode();
    } catch {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });
  }
  return imageDataFromImageSource(img, maxSize);
}

export function generateNormalMapImageData(
  imageData: ImageData,
  options: NormalMapGeneratorOptions
): ImageData {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const scaled = downscaleImageDataIfNeeded(imageData, maxSize);
  return computeNormalMapImageData(scaled, options);
}

export async function generateNormalMapPngBlob(
  imageDataOrUrl: ImageData | string,
  options: NormalMapGeneratorOptions
): Promise<Blob> {
  const id =
    typeof imageDataOrUrl === 'string'
      ? await imageUrlToImageData(imageDataOrUrl, options.maxSize ?? DEFAULT_MAX_SIZE)
      : imageDataOrUrl;
  const normal = generateNormalMapImageData(id, options);
  const canvas = document.createElement('canvas');
  canvas.width = normal.width;
  canvas.height = normal.height;
  canvas.getContext('2d')!.putImageData(normal, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return blob;
}
