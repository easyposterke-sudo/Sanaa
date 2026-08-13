import type { PosterElementInput } from './types';

export type PosterShapePresetId =
  | 'rect'
  | 'rounded-rect'
  | 'rect-two-round'
  | 'circle'
  | 'triangle'
  | 'ellipse'
  | 'line'
  | 'star'
  | 'pentagon'
  | 'hexagon'
  | 'diamond'
  | 'bezier-path';

function normalizePolygonPoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

function regularPolygon(sides: number, cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

function starPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

const BASE = {
  left: 100,
  top: 100,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  opacity: 1,
} as const;

/**
 * Poster element payload for `addElement` (no id / zIndex).
 */
export function posterShapePresetToElement(
  id: PosterShapePresetId
): PosterElementInput {
  switch (id) {
    case 'rect':
      return { ...BASE, type: 'rect', width: 120, height: 80, fill: '#3b82f6', rx: 0 };
    case 'rounded-rect':
      return {
        ...BASE,
        type: 'rect',
        width: 130,
        height: 88,
        fill: '#6366f1',
        rx: 22,
      };
    case 'rect-two-round':
      return {
        ...BASE,
        type: 'rect',
        width: 130,
        height: 88,
        fill: '#0ea5e9',
        rx: 0,
        rectCornerRadii: { tl: 24, tr: 24, br: 0, bl: 0 },
      };
    case 'circle':
      return { ...BASE, type: 'circle', radius: 50, fill: '#ec4899' };
    case 'triangle':
      return { ...BASE, type: 'triangle', width: 100, height: 100, fill: '#22c55e' };
    case 'ellipse':
      return { ...BASE, type: 'ellipse', rx: 70, ry: 45, fill: '#a855f7' };
    case 'line':
      return {
        ...BASE,
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 140,
        y2: 0,
        strokeWidth: 6,
        fill: '#0f172a',
      };
    case 'star':
      return {
        ...BASE,
        type: 'polygon',
        fill: '#f59e0b',
        polygonPoints: normalizePolygonPoints(starPoints(50, 50, 46, 18)),
      };
    case 'pentagon':
      return {
        ...BASE,
        type: 'polygon',
        fill: '#f97316',
        polygonPoints: normalizePolygonPoints(regularPolygon(5, 52, 52, 46)),
      };
    case 'hexagon':
      return {
        ...BASE,
        type: 'polygon',
        fill: '#06b6d4',
        polygonPoints: normalizePolygonPoints(regularPolygon(6, 50, 50, 46)),
      };
    case 'diamond':
      return {
        ...BASE,
        type: 'polygon',
        fill: '#14b8a6',
        polygonPoints: [
          { x: 50, y: 0 },
          { x: 100, y: 50 },
          { x: 50, y: 100 },
          { x: 0, y: 50 },
        ],
      };
    case 'bezier-path':
      return {
        ...BASE,
        type: 'path',
        fill: { type: 'solid', color: '#14b8a6' },
        stroke: '#0f172a',
        strokeWidth: 3,
        closed: true,
        pathPoints: [
          { x: 0, y: 70, outX: 35, outY: 10 },
          { x: 85, y: 0, inX: 45, inY: 0, outX: 130, outY: 0 },
          { x: 170, y: 70, inX: 130, inY: 10, outX: 170, outY: 130 },
          { x: 85, y: 155, inX: 125, inY: 155, outX: 45, outY: 155 },
          { x: 0, y: 70, inX: 0, inY: 130 },
        ],
      };
    default:
      return { ...BASE, type: 'rect', width: 120, height: 80, fill: '#3b82f6', rx: 0 };
  }
}
