import { Gradient, Pattern } from 'fabric';
import type { PosterShapeFill, PatternRepeat } from './types';
import { getTextureById } from './posterTextures';

export type FabricShapeFill = string | Gradient<'linear'> | Gradient<'radial'> | InstanceType<typeof Pattern>;

/** Parse hex (#rgb, #rrggbb) to r,g,b. Returns null if invalid. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return { r, g, b };
}

/** Apply opacity to a hex or rgb/rgba color string. Returns rgba string. */
export function applyColorOpacity(color: string, opacity: number): string {
  const m = color.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
  if (m) {
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${opacity})`;
  }
  const rgb = hexToRgb(color);
  if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  return color;
}

export function normalizePosterShapeFill(
  input: PosterShapeFill | string | undefined,
  fallbackColor: string
): PosterShapeFill {
  if (input && typeof input === 'object' && 'type' in input) {
    return input as PosterShapeFill;
  }
  if (typeof input === 'string' && input.trim()) {
    return { type: 'solid', color: input };
  }
  return { type: 'solid', color: fallbackColor };
}

/** Build Fabric fill (color string or Gradient) in shape local pixel space (0..w, 0..h). */
export function posterShapeFillToFabric(
  fill: Exclude<PosterShapeFill, { type: 'pattern' }>,
  w: number,
  h: number,
  fillOpacity = 1
): FabricShapeFill {
  const applyOpacity = (c: string) =>
    fillOpacity >= 1 ? c : applyColorOpacity(c, fillOpacity);

  if (fill.type === 'solid') return applyOpacity(fill.color);

  const rawStops = fill.stops.length
    ? fill.stops
    : [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }];
  const colorStops = rawStops.map((s) => ({ offset: s.offset, color: applyOpacity(s.color) }));

  if (fill.type === 'linear') {
    const rad = (fill.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x0 = w * (0.5 - cos * 0.5);
    const y0 = h * (0.5 - sin * 0.5);
    const x1 = w * (0.5 + cos * 0.5);
    const y1 = h * (0.5 + sin * 0.5);
    return new Gradient({
      type: 'linear',
      gradientUnits: 'pixels',
      coords: { x1: x0, y1: y0, x2: x1, y2: y1 },
      colorStops,
    });
  }

  const cx = fill.cx * w;
  const cy = fill.cy * h;
  const r = Math.max(w, h) * fill.r;
  return new Gradient({
    type: 'radial',
    gradientUnits: 'pixels',
    coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: r },
    colorStops,
  });
}

/** Create a Fabric Pattern from a poster pattern fill. Async because it loads the texture image. */
export async function posterPatternFillToFabric(
  textureId: string,
  repeat: PatternRepeat = 'repeat',
  scale = 1
): Promise<InstanceType<typeof Pattern>> {
  const tex = getTextureById(textureId);
  const url = tex?.url ?? '';
  const pattern = await Pattern.fromObject(
    { type: 'pattern', source: url, repeat },
    { signal: undefined }
  );
  if (scale !== 1 && pattern.patternTransform) {
    const m = pattern.patternTransform;
    pattern.patternTransform = [m[0] * scale, m[1], m[2], m[3] * scale, m[4], m[5]];
  } else if (scale !== 1) {
    pattern.patternTransform = [scale, 0, 0, scale, 0, 0];
  }
  return pattern;
}
