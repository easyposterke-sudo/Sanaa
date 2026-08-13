import {
  Circle,
  Ellipse,
  Path,
  Rect,
  FabricImage,
  filters as FabricFilters,
  Canvas2dFilterBackend,
  setFilterBackend,
  getFilterBackend,
} from 'fabric';
import type { PosterImageElement, ImageAdjustments } from './types';
import { posterRasterSrc, type PosterRasterElement } from './posterRaster';
import { setFabricRasterLayoutFromElement } from './posterImageFabricLayout';
import { enterFabricReflectSuppress, exitFabricReflectSuppress } from './posterFabricReflectGuard';
import { getTextureById } from './posterTextures';
import { FastCanvasBlurFilter } from './fastCanvasBlur';

/**
 * Force Fabric to use the 2D canvas filter backend.
 * The default WebGL backend conflicts with Three.js's WebGL context — when both
 * compete for GPU resources the loser silently produces black / empty output.
 */
if (!getFilterBackend(false)) {
  setFilterBackend(new Canvas2dFilterBackend());
}

function usesFadeRaster(edge: PosterImageElement['edge']): boolean {
  return edge === 'fade' || edge === 'fade-paper-tear';
}

function usesPaperTearClip(edge: PosterImageElement['edge']): boolean {
  return edge === 'paper-tear' || edge === 'fade-paper-tear';
}

/** Stable key for Fabric recreate when image appearance pipeline changes. */
export function getPosterImageEffectsKey(el: PosterRasterElement): string {
  return [
    el.textureOverlay?.textureId ?? '',
    Number(el.textureOverlay?.opacity ?? 0.5).toFixed(2),
    el.mask ?? 'none',
    Number(el.maskCornerRadius ?? 0.18).toFixed(3),
    Number(el.maskImageOffsetX ?? 0.5).toFixed(3),
    Number(el.maskImageOffsetY ?? 0.5).toFixed(3),
    Number(el.maskImageScale ?? 1).toFixed(3),
    Number(el.maskScale ?? 1).toFixed(3),
    el.edge ?? 'none',
    Number(el.edgeFadeAmount ?? 0.35).toFixed(3),
    Number(el.edgeFadeMinOpacity ?? 0).toFixed(3),
    el.edgeFadeDirection ?? 'radial',
    el.edgeTearSeed ?? 0,
  ].join('|');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jitter for one coordinate along an edge. */
function jitter(rnd: () => number, amp: number): number {
  return (rnd() - 0.5) * 2 * amp;
}

/**
 * Closed path approximating a rectangle with torn / jagged edges (clipPath).
 * Coordinates are **centered** on (0,0) to match FabricImage._renderFill, which draws
 * the bitmap from (-w/2,-h/2) — not from (0,0).
 */
export function buildPaperTearPathD(width: number, height: number, seed: number): string {
  const rnd = mulberry32(seed);
  const segs = Math.max(14, Math.round((width + height) / 28));
  const amp = Math.min(width, height) * 0.028;
  const x0 = -width / 2;
  const y0 = -height / 2;
  const x1 = width / 2;
  const y1 = height / 2;

  let d = '';
  // Top edge: (x0,y0) → (x1,y0)
  d += `M ${(x0 + jitter(rnd, amp)).toFixed(2)} ${(y0 + jitter(rnd, amp)).toFixed(2)}`;
  for (let i = 1; i <= segs; i++) {
    const x = x0 + (i / segs) * width;
    d += ` L ${x.toFixed(2)} ${(y0 + jitter(rnd, amp)).toFixed(2)}`;
  }
  // Right edge: → (x1,y1)
  for (let i = 1; i <= segs; i++) {
    const y = y0 + (i / segs) * height;
    d += ` L ${(x1 + jitter(rnd, amp)).toFixed(2)} ${y.toFixed(2)}`;
  }
  // Bottom edge
  for (let i = 1; i <= segs; i++) {
    const x = x1 - (i / segs) * width;
    d += ` L ${x.toFixed(2)} ${(y1 + jitter(rnd, amp)).toFixed(2)}`;
  }
  // Left edge → close
  for (let i = 1; i <= segs; i++) {
    const y = y1 - (i / segs) * height;
    d += ` L ${(x0 + jitter(rnd, amp)).toFixed(2)} ${y.toFixed(2)}`;
  }
  d += ' Z';
  return d;
}

const fadeCache = new Map<string, string>();
const FADE_CACHE_MAX = 8;

function compactSourceKey(src: string): string {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${src.length}:${(hash >>> 0).toString(36)}`;
}

function trimFadeCache() {
  while (fadeCache.size > FADE_CACHE_MAX) {
    const first = fadeCache.keys().next().value;
    if (first !== undefined) {
      const url = fadeCache.get(first);
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      fadeCache.delete(first);
    }
  }
}

function canvasToWebpObjectUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null);
    }, 'image/webp', 0.85);
  });
}

/** Only remote http(s) needs CORS; blob/data URLs break or taint incorrectly with `anonymous`. */
function crossOriginForImageSrc(src: string): 'anonymous' | undefined {
  if (/^https?:\/\//i.test(src)) return 'anonymous';
  return undefined;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const co = crossOriginForImageSrc(src);
    if (co) img.crossOrigin = co;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

export type FeatherImageEdgesOptions = {
  /** Alpha (0–1) at the outer/bottom end of the fade; higher = less harsh transparent rim. */
  minEdgeOpacity?: number;
  /** `radial` = vignette on all sides; `bottom` = fade only upward from the bottom edge. */
  direction?: 'radial' | 'bottom';
};

/**
 * Vignette / bottom band fade via destination-in alpha mask.
 * strength: how far the fade reaches inward (higher = stronger).
 */
export async function featherImageEdges(
  src: string,
  strength: number,
  options?: FeatherImageEdgesOptions
): Promise<string> {
  const s = Math.max(0, Math.min(1, strength));
  const dir = options?.direction ?? 'radial';
  const minA = Math.max(0, Math.min(1, options?.minEdgeOpacity ?? 0));
  const key = `${compactSourceKey(src)}|${s.toFixed(3)}|${minA.toFixed(3)}|${dir}`;
  const hit = fadeCache.get(key);
  if (hit) {
    fadeCache.delete(key);
    fadeCache.set(key, hit);
    return hit;
  }

  try {
    const img = await loadHtmlImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 1 || h < 1) return src;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;

    ctx.drawImage(img, 0, 0, w, h);

    let g: CanvasGradient;
    if (dir === 'bottom') {
      g = ctx.createLinearGradient(0, 0, 0, h);
      const innerY = h * Math.max(0.05, 1 - s * 0.92);
      const tInner = Math.min(0.99, innerY / h);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(tInner, 'rgba(255,255,255,1)');
      g.addColorStop(1, `rgba(255,255,255,${minA})`);
    } else {
      const cx = w / 2;
      const cy = h / 2;
      const rMax = Math.hypot(w, h) / 2;
      const inner = rMax * Math.max(0.05, 1 - s * 0.92);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMax);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(Math.min(0.99, inner / rMax), 'rgba(255,255,255,1)');
      g.addColorStop(1, `rgba(255,255,255,${minA})`);
    }

    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const objectUrl = await canvasToWebpObjectUrl(canvas);
    canvas.width = 1;
    canvas.height = 1;
    if (!objectUrl) return src;
    fadeCache.set(key, objectUrl);
    trimFadeCache();
    return objectUrl;
  } catch {
    return src;
  }
}

/** Bitmap URL after optional fade (vignette before vector clip / tear). */
export async function resolvePosterImageFabricSrc(el: PosterRasterElement): Promise<string> {
  let url = posterRasterSrc(el);
  if (usesFadeRaster(el.edge)) {
    url = await featherImageEdges(url, el.edgeFadeAmount ?? 0.35, {
      minEdgeOpacity: el.edgeFadeMinOpacity ?? 0,
      direction: el.edgeFadeDirection ?? 'radial',
    });
  }
  if (el.textureOverlay?.textureId) {
    url = await applyTextureOverlay(
      url,
      el.textureOverlay.textureId,
      el.textureOverlay.opacity ?? 0.5
    );
  }
  return url;
}

/** Composite a texture pattern over an image. Returns data URL. */
async function applyTextureOverlay(
  imageUrl: string,
  textureId: string,
  opacity: number
): Promise<string> {
  const tex = getTextureById(textureId);
  if (!tex?.url) return imageUrl;

  const img = await loadImage(imageUrl);
  const texImg = await loadImage(tex.url);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return imageUrl;

  ctx.drawImage(img, 0, 0);
  ctx.globalAlpha = opacity;
  const pat = ctx.createPattern(texImg, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;

  return c.toDataURL('image/webp', 0.85);
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
 * Compute cropX, cropY and the source pixel size (cropW × cropH) for mask / paper-tear pan-zoom.
 * - maskImageOffsetX/Y: 0 = left/top, 0.5 = center, 1 = right/bottom (position of crop center in source image)
 * - maskImageScale: 1 = fill mask, >1 = zoom in (smaller crop region)
 */
function computeMaskImageCrop(
  img: FabricImage,
  el: PosterRasterElement,
  visibleW: number,
  visibleH: number
): { cropX: number; cropY: number; cropW: number; cropH: number } {
  const elWidth = (img.getElement() as HTMLImageElement)?.naturalWidth || img.width || 1;
  const elHeight = (img.getElement() as HTMLImageElement)?.naturalHeight || img.height || 1;

  // Zoom: 1 = fill mask, >1 = zoom in (smaller crop region)
  const fillScale = Math.max(visibleW / elWidth, visibleH / elHeight, 1);
  const zoom = el.maskImageScale ?? 1;
  const cropW = Math.min(elWidth, visibleW / (fillScale * zoom));
  const cropH = Math.min(elHeight, visibleH / (fillScale * zoom));

  // Position: offset 0-1 places the *center* of the crop in the source (0=left/top, 1=right/bottom)
  const offsetX = el.maskImageOffsetX ?? 0.5;
  const offsetY = el.maskImageOffsetY ?? 0.5;
  const centerX = offsetX * elWidth;
  const centerY = offsetY * elHeight;
  const cropX = Math.max(0, Math.min(elWidth - cropW, centerX - cropW / 2));
  const cropY = Math.max(0, Math.min(elHeight - cropH, centerY - cropH / 2));

  return { cropX, cropY, cropW, cropH };
}

/**
 * Same mask / edge rules as `applyPosterImageClipPath`: returns the source rectangle in bitmap pixels
 * and Fabric object local width/height so canvas → local → source can use linear UV (not cropX+local when cropW≠localW).
 */
export function getPosterImageSourceRectForCropBake(
  img: FabricImage,
  el: PosterRasterElement
): { cropX: number; cropY: number; cropW: number; cropH: number; localW: number; localH: number } {
  const w = img.width || 1;
  const h = img.height || 1;
  const elWidth = (img.getElement() as HTMLImageElement)?.naturalWidth || img.width || 1;
  const elHeight = (img.getElement() as HTMLImageElement)?.naturalHeight || img.height || 1;
  const mask = el.mask ?? 'none';
  const maskScale = el.maskScale ?? 1;

  if (mask === 'circle' || mask === 'ellipse' || mask === 'rounded-rect') {
    const baseW = mask === 'circle' ? Math.min(w, h) : w;
    const baseH = mask === 'circle' ? Math.min(w, h) : h;
    const visibleW = baseW * maskScale;
    const visibleH = baseH * maskScale;
    const { cropX, cropY, cropW, cropH } = computeMaskImageCrop(img, el, visibleW, visibleH);
    return { cropX, cropY, cropW, cropH, localW: w, localH: h };
  }
  if (usesPaperTearClip(el.edge ?? 'none')) {
    const { cropX, cropY, cropW, cropH } = computeMaskImageCrop(img, el, w, h);
    return { cropX, cropY, cropW, cropH, localW: w, localH: h };
  }
  return {
    cropX: 0,
    cropY: 0,
    cropW: elWidth,
    cropH: elHeight,
    localW: w,
    localH: h,
  };
}

/** Apply vector clip: any shape mask overrides paper-tear when both are set. */
export function applyPosterImageClipPath(img: FabricImage, el: PosterRasterElement): void {
  const w = img.width || 1;
  const h = img.height || 1;
  const mask = el.mask ?? 'none';
  const maskScale = el.maskScale ?? 1;

  // Apply image position/scale within mask when a shape mask is used
  if (mask === 'circle' || mask === 'ellipse' || mask === 'rounded-rect') {
    const baseW = mask === 'circle' ? Math.min(w, h) : w;
    const baseH = mask === 'circle' ? Math.min(w, h) : h;
    const visibleW = baseW * maskScale;
    const visibleH = baseH * maskScale;
    const { cropX, cropY } = computeMaskImageCrop(img, el, visibleW, visibleH);
    img.set({ cropX, cropY });
  } else if (usesPaperTearClip(el.edge ?? 'none')) {
    const { cropX, cropY } = computeMaskImageCrop(img, el, w, h);
    img.set({ cropX, cropY });
  } else {
    img.set({ cropX: 0, cropY: 0 });
  }

  // FabricImage paints from (-w/2,-h/2); clipPath shares that space — center clips at (0,0).
  // maskScale controls mask frame size independently from image content.
  if (mask === 'circle') {
    const radius = (maskScale * Math.min(w, h)) / 2;
    img.clipPath = new Circle({
      radius,
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      fill: '#000000',
    });
    return;
  }

  if (mask === 'ellipse') {
    img.clipPath = new Ellipse({
      rx: (maskScale * w) / 2,
      ry: (maskScale * h) / 2,
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      fill: '#000000',
    });
    return;
  }

  if (mask === 'rounded-rect') {
    const t = Math.min(w, h);
    const frac = Math.max(0, Math.min(0.5, el.maskCornerRadius ?? 0.18));
    let r = t * frac * maskScale;
    const rectW = w * maskScale;
    const rectH = h * maskScale;
    r = Math.min(r, rectW / 2, rectH / 2);
    img.clipPath = new Rect({
      width: rectW,
      height: rectH,
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      rx: r,
      ry: r,
      fill: '#000000',
    });
    return;
  }

  if (usesPaperTearClip(el.edge)) {
    const seed = el.edgeTearSeed ?? 1;
    img.clipPath = new Path(buildPaperTearPathD(w, h, seed), {
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      absolutePositioned: false,
      fill: '#000000',
      stroke: undefined,
      strokeWidth: 0,
    });
    return;
  }

  img.clipPath = undefined;
}

type PosterFabricImageData = {
  posterId?: string;
  imageSrc?: string;
  imageEffectsKey?: string;
};

/**
 * Update mask / fade / tear on an existing FabricImage without removing it (keeps selection).
 */
export async function applyPosterImageEffectsInPlace(
  img: FabricImage,
  el: PosterRasterElement
): Promise<void> {
  enterFabricReflectSuppress();
  try {
    const url = await resolvePosterImageFabricSrc(el);
    const co = crossOriginForImageSrc(url);
    await img.setSrc(url, co ? { crossOrigin: co } : {});
    applyPosterImageClipPath(img, el);
    setFabricRasterLayoutFromElement(img, el);
    const prev = (img as { data?: PosterFabricImageData }).data ?? {};
    (img as { data?: PosterFabricImageData }).data = {
      ...prev,
      posterId: el.id,
      imageSrc: posterRasterSrc(el),
      imageEffectsKey: getPosterImageEffectsKey(el),
    };
    img.set({ dirty: true });
  } finally {
    // Fabric may emit `object:modified` on a later microtask/frame after setSrc/layout;
    // defer exit so those handlers still see suppression.
    setTimeout(() => exitFabricReflectSuppress(), 0);
  }
}

const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0];

/**
 * Build a Fabric.js filter pipeline from ImageAdjustments and apply it to a FabricImage.
 * Calls `img.applyFilters()` so the cached element is re-rendered immediately.
 */
function normalizeHexForTint(raw: string | undefined): string {
  let h = (raw ?? '#ffffff').trim();
  if (!h.startsWith('#')) h = `#${h}`;
  const body = h.slice(1).replace(/[^0-9A-Fa-f]/g, '');
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
  }
  if (body.length >= 6) {
    return `#${body.slice(0, 6)}`.toLowerCase();
  }
  return '#ffffff';
}

export function buildImageAdjustmentFilters(adj: ImageAdjustments) {
  const pipeline: InstanceType<
    | typeof FabricFilters.Brightness
    | typeof FabricFilters.Contrast
    | typeof FabricFilters.HueRotation
    | typeof FabricFilters.Saturation
    | typeof FastCanvasBlurFilter
    | typeof FabricFilters.Convolute
    | typeof FabricFilters.BlendColor
  >[] = [];

  const b = (adj.adjustBrightness ?? 0) / 100;
  const c = (adj.adjustContrast ?? 0) / 100;
  const hueDeg = adj.adjustHue ?? 0;
  const hueRot = Math.max(-1, Math.min(1, hueDeg / 180));
  const s = (adj.adjustSaturation ?? 0) / 100;
  const sh = (adj.adjustSharpness ?? 0) / 100;
  const bl = (adj.adjustBlur ?? 0) / 100;
  const tintAmt = Math.max(0, Math.min(100, adj.adjustTintAmount ?? 0));

  if (b !== 0) pipeline.push(new FabricFilters.Brightness({ brightness: b }));
  if (c !== 0) pipeline.push(new FabricFilters.Contrast({ contrast: c }));
  if (hueRot !== 0) pipeline.push(new FabricFilters.HueRotation({ rotation: hueRot }));
  if (s !== 0) pipeline.push(new FabricFilters.Saturation({ saturation: s }));
  if (bl > 0) pipeline.push(new FastCanvasBlurFilter({ blur: bl }));
  if (sh > 0) {
    const blended = SHARPEN_KERNEL.map((v) => {
      if (v === 5) return 1 + (5 - 1) * sh;
      return v * sh;
    });
    pipeline.push(new FabricFilters.Convolute({ matrix: blended }));
  }
  if (tintAmt > 0) {
    pipeline.push(
      new FabricFilters.BlendColor({
        color: normalizeHexForTint(adj.adjustTintColor),
        mode: 'tint',
        alpha: tintAmt / 100,
      })
    );
  }

  return pipeline;
}

export function applyImageAdjustmentFilters(
  img: FabricImage,
  adj: ImageAdjustments
): void {
  img.filters = buildImageAdjustmentFilters(adj);
  try {
    img.applyFilters();
  } catch {
    img.filters = [];
    try { img.applyFilters(); } catch { /* last resort: leave unfiltered */ }
  }
  img.set({ dirty: true });
}
