import type {
  CanvasBackground,
  PosterElement,
  PosterPathElement,
  PosterProject,
  PosterShapeElement,
  PosterShapeFill,
} from '../types';

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

/** Re-hues a template's canvas and vector decorations while leaving photos and text legible. */
export function applyTemplateTheme(project: PosterProject, themeColor: string): PosterProject {
  const themeRgb = parseHex(themeColor);
  if (!themeRgb) return project;
  const theme = rgbToHsl(themeRgb);

  return {
    ...project,
    canvasBackgroundColor: recolorColor(project.canvasBackgroundColor ?? '#ffffff', theme, true),
    canvasBackground: project.canvasBackground
      ? recolorCanvasBackground(project.canvasBackground, theme)
      : { type: 'solid', color: recolorColor(project.canvasBackgroundColor ?? '#ffffff', theme, true) },
    elements: project.elements.map((element) => recolorElement(element, theme)),
  };
}

function recolorCanvasBackground(background: CanvasBackground, theme: Hsl): CanvasBackground {
  if (background.type === 'solid') {
    return { ...background, color: recolorColor(background.color, theme, true) };
  }
  return {
    ...background,
    stops: background.stops.map((stop) => ({
      ...stop,
      color: recolorColor(stop.color, theme, true),
    })),
  };
}

function recolorElement(element: PosterElement, theme: Hsl): PosterElement {
  if (isShapeElement(element)) {
    return {
      ...element,
      fill: recolorFill(element.fill, theme),
      ...(element.stroke ? { stroke: recolorColor(element.stroke, theme, false) } : {}),
    };
  }
  if (element.type === 'path') {
    const path = element as PosterPathElement;
    return {
      ...path,
      fill: recolorFill(path.fill, theme),
      ...(path.stroke ? { stroke: recolorColor(path.stroke, theme, false) } : {}),
    };
  }
  return element;
}

function isShapeElement(element: PosterElement): element is PosterShapeElement {
  return ['rect', 'circle', 'triangle', 'ellipse', 'line', 'polygon'].includes(element.type);
}

function recolorFill(fill: string | PosterShapeFill, theme: Hsl): string | PosterShapeFill {
  if (typeof fill === 'string') return recolorColor(fill, theme, false);
  if (fill.type === 'pattern') return fill;
  if (fill.type === 'solid') return { ...fill, color: recolorColor(fill.color, theme, false) };
  return {
    ...fill,
    stops: fill.stops.map((stop) => ({
      ...stop,
      color: recolorColor(stop.color, theme, false),
    })),
  };
}

function recolorColor(color: string, theme: Hsl, background: boolean): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const original = rgbToHsl(parsed.rgb);
  const nearlyNeutral = original.s < 0.08;
  if (!background && nearlyNeutral) return color;

  const lightness = background
    ? clamp(original.l, 0.12, 0.78)
    : clamp(original.l, 0.18, 0.82);
  const saturation = background
    ? clamp(Math.max(theme.s, 0.38) * 0.82, 0.3, 0.78)
    : clamp(Math.max(theme.s, 0.45), 0.35, 0.9);
  const next = hslToRgb({ h: theme.h, s: saturation, l: lightness });
  if (parsed.alpha < 1) {
    return `rgba(${next.r}, ${next.g}, ${next.b}, ${trimAlpha(parsed.alpha)})`;
  }
  return rgbToHex(next);
}

function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const hex = parseHex(value);
  if (hex) return { rgb: hex, alpha: 1 };
  const match = value.trim().match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i,
  );
  if (!match) return null;
  return {
    rgb: {
      r: clamp(Number(match[1]), 0, 255),
      g: clamp(Number(match[2]), 0, 255),
      b: clamp(Number(match[3]), 0, 255),
    },
    alpha: match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1),
  };
}

function parseHex(value: string): Rgb | null {
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = h / 60;
  const component = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let base: [number, number, number];
  if (huePrime < 1) base = [chroma, component, 0];
  else if (huePrime < 2) base = [component, chroma, 0];
  else if (huePrime < 3) base = [0, chroma, component];
  else if (huePrime < 4) base = [0, component, chroma];
  else if (huePrime < 5) base = [component, 0, chroma];
  else base = [chroma, 0, component];
  const offset = l - chroma / 2;
  return {
    r: Math.round((base[0] + offset) * 255),
    g: Math.round((base[1] + offset) * 255),
    b: Math.round((base[2] + offset) * 255),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((component) => Math.round(component).toString(16).padStart(2, '0'))
    .join('')}`;
}

function trimAlpha(alpha: number): string {
  return alpha.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
