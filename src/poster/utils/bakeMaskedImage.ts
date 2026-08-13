import type { PosterImageMask } from '../types';

export interface BakeMaskParams {
  src: string;
  mask: PosterImageMask;
  offsetX: number;
  offsetY: number;
  zoom: number;
  maskScale: number;
  maskCornerRadius?: number;
  /** Output scale factor (e.g. 2 for retina). */
  resolutionScale?: number;
  /**
   * Preview stage size in px — must match `MaskEditorModal` (`stageW` / `stageH`) or crop drifts on small screens.
   * Defaults match the desktop modal stage.
   */
  stageW?: number;
  stageH?: number;
}

const MAX_OUTPUT_DIMENSION = 4096;
const MAX_OUTPUT_PIXELS = 12_000_000;

export interface MaskBakeGeometry {
  outW: number;
  outH: number;
  sourceX: number;
  sourceY: number;
  sourceW: number;
  sourceH: number;
  destX: number;
  destY: number;
  destW: number;
  destH: number;
}

export function computeMaskPreviewSize(
  mask: Exclude<PosterImageMask, 'none'>,
  maskScale: number,
  stageW: number,
  stageH: number
): { w: number; h: number } {
  const short = Math.min(stageW, stageH);
  if (mask === 'circle') {
    const side = Math.max(36, Math.min(stageW * 0.95, stageH * 0.95, short * 0.7 * maskScale));
    return { w: side, h: side };
  }
  if (mask === 'ellipse') {
    return {
      w: Math.max(36, Math.min(stageW * 0.95, stageW * 0.72 * maskScale)),
      h: Math.max(36, Math.min(stageH * 0.95, stageH * 0.58 * maskScale)),
    };
  }
  return {
    w: Math.max(36, Math.min(stageW * 0.95, stageW * 0.72 * maskScale)),
    h: Math.max(36, Math.min(stageH * 0.95, stageH * 0.72 * maskScale)),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const co = /^https?:\/\//i.test(src) ? 'anonymous' : undefined;
    if (co) img.crossOrigin = co;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

/**
 * Maps the mask preview to source and destination rectangles.
 *
 * The requested source rectangle is deliberately allowed to extend beyond the
 * bitmap. Only its intersection with the bitmap is drawn, leaving transparent
 * pixels where the mask is larger than (or partly outside) the image.
 */
export function computeMaskBakeGeometry(
  nw: number,
  nh: number,
  mask: Exclude<PosterImageMask, 'none'>,
  offsetX: number,
  offsetY: number,
  zoom: number,
  maskScale: number,
  resolutionScale: number,
  stageW: number,
  stageH: number
): MaskBakeGeometry {
  const safeNw = Math.max(1, nw);
  const safeNh = Math.max(1, nh);
  const safeZoom = Math.max(0.01, zoom);
  const safeResolutionScale = Math.max(0.01, resolutionScale);
  const fitScale = Math.max(0.000001, Math.min(stageW / safeNw, stageH / safeNh));
  const imageStageScale = fitScale * safeZoom;
  const imgDisplayW = safeNw * imageStageScale;
  const imgDisplayH = safeNh * imageStageScale;

  const { w: maskW, h: maskH } = computeMaskPreviewSize(mask, maskScale, stageW, stageH);
  const requestedSourceW = maskW / imageStageScale;
  const requestedSourceH = maskH / imageStageScale;
  const requestedSourceX = offsetX * safeNw - requestedSourceW / 2;
  const requestedSourceY = offsetY * safeNh - requestedSourceH / 2;

  const desiredPixelsPerStagePixel = safeResolutionScale / imageStageScale;
  const desiredOutW = Math.max(1, maskW * desiredPixelsPerStagePixel);
  const desiredOutH = Math.max(1, maskH * desiredPixelsPerStagePixel);
  const outputLimitScale = Math.min(
    1,
    MAX_OUTPUT_DIMENSION / desiredOutW,
    MAX_OUTPUT_DIMENSION / desiredOutH,
    Math.sqrt(MAX_OUTPUT_PIXELS / (desiredOutW * desiredOutH))
  );
  const outW = Math.max(1, Math.round(desiredOutW * outputLimitScale));
  const outH = Math.max(1, Math.round(desiredOutH * outputLimitScale));

  const sourceX = Math.max(0, requestedSourceX);
  const sourceY = Math.max(0, requestedSourceY);
  const sourceRight = Math.min(safeNw, requestedSourceX + requestedSourceW);
  const sourceBottom = Math.min(safeNh, requestedSourceY + requestedSourceH);
  const sourceW = Math.max(0, sourceRight - sourceX);
  const sourceH = Math.max(0, sourceBottom - sourceY);

  return {
    outW,
    outH,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    destX: ((sourceX - requestedSourceX) / requestedSourceW) * outW,
    destY: ((sourceY - requestedSourceY) / requestedSourceH) * outH,
    destW: (sourceW / requestedSourceW) * outW,
    destH: (sourceH / requestedSourceH) * outH,
  };
}

/**
 * Renders the masked region of an image to a new bitmap (data URL).
 * Matches the Mask editor modal's coordinate mapping so WYSIWYG.
 */
export async function bakeMaskedImage(params: BakeMaskParams): Promise<string> {
  const {
    src,
    mask,
    offsetX,
    offsetY,
    zoom,
    maskScale,
    maskCornerRadius = 0.18,
    resolutionScale = 2,
    stageW: stageWIn = 540,
    stageH: stageHIn = 340,
  } = params;

  const stageW = Math.max(1, stageWIn);
  const stageH = Math.max(1, stageHIn);

  if (mask === 'none') {
    return src;
  }

  const img = await loadImage(src);
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  const geometry = computeMaskBakeGeometry(
    nw,
    nh,
    mask,
    offsetX,
    offsetY,
    zoom,
    maskScale,
    resolutionScale,
    stageW,
    stageH
  );
  const { outW, outH, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH } = geometry;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.save();
  if (mask === 'circle') {
    ctx.beginPath();
    ctx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
    ctx.clip();
  } else if (mask === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(outW / 2, outH / 2, outW / 2, outH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
  } else if (mask === 'rounded-rect') {
    const t = Math.min(outW, outH);
    const r = Math.min(t * maskCornerRadius, outW / 2, outH / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, outW, outH, r);
    ctx.clip();
  }
  if (sourceW > 0 && sourceH > 0 && destW > 0 && destH > 0) {
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH);
  }
  ctx.restore();

  return canvas.toDataURL('image/webp', 0.85);
}
