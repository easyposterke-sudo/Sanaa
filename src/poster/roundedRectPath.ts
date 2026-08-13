import type { PosterShapeElement } from './types';

/**
 * When set, the rectangle is drawn as a Path with independent corner radii (Fabric Rect is uniform only).
 */
export function rectHasPerCornerRadii(shape: PosterShapeElement): shape is PosterShapeElement & {
  type: 'rect';
  rectCornerRadii: NonNullable<PosterShapeElement['rectCornerRadii']>;
} {
  return shape.type === 'rect' && shape.rectCornerRadii != null;
}

/**
 * Rectangles keep corner radii in pixels. Bake Fabric scaling into their
 * dimensions so non-uniform resizing does not turn circular corners into
 * stretched ellipses.
 */
export function normalizeRectScaleToDimensions(
  shape: PosterShapeElement & { type: 'rect' },
  scaleX: number,
  scaleY: number
): { width: number; height: number; scaleX: number; scaleY: number } {
  const safeScaleX = Number.isFinite(scaleX) && scaleX !== 0 ? scaleX : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY !== 0 ? scaleY : 1;
  return {
    width: Math.max(1, (shape.width ?? 100) * Math.abs(safeScaleX)),
    height: Math.max(1, (shape.height ?? 80) * Math.abs(safeScaleY)),
    scaleX: safeScaleX < 0 ? -1 : 1,
    scaleY: safeScaleY < 0 ? -1 : 1,
  };
}

function clampCorners(
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number
): { tl: number; tr: number; br: number; bl: number } {
  const cap = (r: number) => Math.min(Math.max(0, r), w / 2, h / 2);
  tl = cap(tl);
  tr = cap(tr);
  br = cap(br);
  bl = cap(bl);
  let scale = 1;
  if (tl + tr > w) scale = Math.min(scale, w / (tl + tr));
  if (tr + br > h) scale = Math.min(scale, h / (tr + br));
  if (br + bl > w) scale = Math.min(scale, w / (br + bl));
  if (bl + tl > h) scale = Math.min(scale, h / (bl + tl));
  if (scale < 1) {
    tl *= scale;
    tr *= scale;
    br *= scale;
    bl *= scale;
  }
  return { tl, tr, br, bl };
}

/** SVG path d for a rounded rect from (0,0) with size w×h, y-axis downward (canvas/SVG). */
export function roundedRectPathD(
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number
): string {
  if (w <= 0 || h <= 0) return 'M 0 0 Z';
  const c = clampCorners(w, h, tl, tr, br, bl);
  tl = c.tl;
  tr = c.tr;
  br = c.br;
  bl = c.bl;

  const d: string[] = [];
  d.push(`M ${tl} 0`);
  if (w - tl - tr > 1e-6) d.push(`L ${w - tr} 0`);
  if (tr > 1e-6) d.push(`A ${tr} ${tr} 0 0 1 ${w} ${tr}`);
  else d.push(`L ${w} 0`);

  if (h - tr - br > 1e-6) d.push(`L ${w} ${h - br}`);
  if (br > 1e-6) d.push(`A ${br} ${br} 0 0 1 ${w - br} ${h}`);
  else d.push(`L ${w} ${h}`);

  if (w - br - bl > 1e-6) d.push(`L ${bl} ${h}`);
  if (bl > 1e-6) d.push(`A ${bl} ${bl} 0 0 1 0 ${h - bl}`);
  else d.push(`L 0 ${h}`);

  if (h - bl - tl > 1e-6) d.push(`L 0 ${tl}`);
  if (tl > 1e-6) d.push(`A ${tl} ${tl} 0 0 1 ${tl} 0`);
  else d.push(`L 0 0`);

  d.push('Z');
  return d.join(' ');
}

export function perCornerRadiiFromShape(shape: PosterShapeElement & { type: 'rect' }): {
  tl: number;
  tr: number;
  br: number;
  bl: number;
} {
  const c = shape.rectCornerRadii;
  const w = shape.width ?? 100;
  const h = shape.height ?? 80;
  if (!c) {
    const r = shape.rx ?? 0;
    return clampCorners(w, h, r, r, r, r);
  }
  return clampCorners(w, h, c.tl ?? 0, c.tr ?? 0, c.br ?? 0, c.bl ?? 0);
}
