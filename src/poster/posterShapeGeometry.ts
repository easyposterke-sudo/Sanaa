import type { PosterShapeElement } from './types';
import { normalizePosterShapeFill } from './shapeFillFabric';

export function getPosterShapeLocalSize(el: PosterShapeElement): { w: number; h: number } {
  switch (el.type) {
    case 'rect':
      return { w: el.width ?? 100, h: el.height ?? 80 };
    case 'circle': {
      const r = el.radius ?? 50;
      const d = r * 2;
      return { w: d, h: d };
    }
    case 'triangle':
      return { w: el.width ?? 100, h: el.height ?? 100 };
    case 'ellipse':
      return { w: (el.rx ?? 60) * 2, h: (el.ry ?? 40) * 2 };
    case 'line': {
      const x1 = el.x1 ?? 0;
      const y1 = el.y1 ?? 0;
      const x2 = el.x2 ?? 120;
      const y2 = el.y2 ?? 80;
      return { w: Math.max(Math.abs(x2 - x1), 1), h: Math.max(Math.abs(y2 - y1), 1) };
    }
    case 'polygon': {
      const pts = el.polygonPoints;
      if (!pts?.length) return { w: 100, h: 100 };
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        w: Math.max(Math.max(...xs) - Math.min(...xs), 1),
        h: Math.max(Math.max(...ys) - Math.min(...ys), 1),
      };
    }
    default:
      return { w: 100, h: 100 };
  }
}

export function shapeFillFallbackForType(t: PosterShapeElement['type']): string {
  switch (t) {
    case 'rect':
      return '#3b82f6';
    case 'circle':
      return '#ec4899';
    case 'triangle':
      return '#22c55e';
    case 'ellipse':
      return '#a855f7';
    case 'line':
      return '#0f172a';
    case 'polygon':
      return '#f97316';
    default:
      return '#64748b';
  }
}

/** Lines use stroke; use solid color or first gradient stop. */
export function lineStrokeFromFill(fill: PosterShapeElement['fill'], fallback: string): string {
  const n = normalizePosterShapeFill(fill, fallback);
  if (n.type === 'solid') return n.color;
  if (n.type === 'linear' || n.type === 'radial') return n.stops[0]?.color ?? fallback;
  return fallback;
}
