import { util, type FabricImage } from 'fabric';
import type { PosterRasterElement } from './posterRaster';
import { getPosterImageSourceRectForCropBake, resolvePosterImageFabricSrc } from './imageEffects';

export type PosterImageCropRect = { left: number; top: number; width: number; height: number };

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
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
 * Bakes the canvas-space crop into a new PNG data URL and layout so the selection
 * stays visually aligned. Uses the same resolved bitmap as Fabric (fade/texture overlay).
 */
export async function bakePosterImageCrop(
  el: PosterRasterElement,
  fabricImg: FabricImage,
  cropCanvas: PosterImageCropRect
): Promise<{
  dataUrl: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
}> {
  if (cropCanvas.width < 2 || cropCanvas.height < 2) {
    throw new Error('Crop area too small');
  }

  const slice = getPosterImageSourceRectForCropBake(fabricImg, el);
  const lw = slice.localW || 1;
  const lh = slice.localH || 1;

  const m = fabricImg.calcTransformMatrix();
  const inv = util.invertTransform(m);
  const corners = [
    { x: cropCanvas.left, y: cropCanvas.top },
    { x: cropCanvas.left + cropCanvas.width, y: cropCanvas.top },
    { x: cropCanvas.left + cropCanvas.width, y: cropCanvas.top + cropCanvas.height },
    { x: cropCanvas.left, y: cropCanvas.top + cropCanvas.height },
  ];
  const local = corners.map((p) => util.transformPoint(p, inv));
  let minX = Math.min(...local.map((p) => p.x));
  let maxX = Math.max(...local.map((p) => p.x));
  let minY = Math.min(...local.map((p) => p.y));
  let maxY = Math.max(...local.map((p) => p.y));

  // FabricImage renders the bitmap in local space centered at (0,0): x ∈ [-width/2, width/2]
  // (see Fabric's _stroke using moveTo(-w,-h)). Map to top-left UV ∈ [0, width] for texture math.
  const hlw = lw / 2;
  const hlh = lh / 2;
  minX += hlw;
  maxX += hlw;
  minY += hlh;
  maxY += hlh;

  minX = clamp(minX, 0, lw);
  maxX = clamp(maxX, 0, lw);
  minY = clamp(minY, 0, lh);
  maxY = clamp(maxY, 0, lh);
  if (maxX - minX < 1 || maxY - minY < 1) {
    throw new Error('Crop area too small');
  }

  const { cropX, cropY, cropW, cropH } = slice;

  const url = await resolvePosterImageFabricSrc(el);
  const bitmap = await loadImage(url);
  const nw = bitmap.naturalWidth || bitmap.width || 1;
  const nh = bitmap.naturalHeight || bitmap.height || 1;

  // Map Fabric local (0…localW) linearly onto source (cropX…cropX+cropW), same as masked draw in applyPosterImageClipPath.
  let sx0 = cropX + (minX / lw) * cropW;
  let sy0 = cropY + (minY / lh) * cropH;
  let sx1 = cropX + (maxX / lw) * cropW;
  let sy1 = cropY + (maxY / lh) * cropH;
  sx0 = clamp(sx0, 0, nw);
  sy0 = clamp(sy0, 0, nh);
  sx1 = clamp(sx1, 0, nw);
  sy1 = clamp(sy1, 0, nh);
  const sw = Math.max(1, Math.round(sx1 - sx0));
  const sh = Math.max(1, Math.round(sy1 - sy0));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(bitmap, sx0, sy0, sw, sh, 0, 0, sw, sh);
  const dataUrl = canvas.toDataURL('image/webp', 0.85);

  const signX = el.scaleX < 0 ? -1 : 1;
  const signY = el.scaleY < 0 ? -1 : 1;
  const scaleX = signX * (cropCanvas.width / sw);
  const scaleY = signY * (cropCanvas.height / sh);

  return {
    dataUrl,
    left: cropCanvas.left,
    top: cropCanvas.top,
    scaleX,
    scaleY,
  };
}
