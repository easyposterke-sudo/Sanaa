import type { EditorState } from '../core/types';

export type PosterElementType =
  | 'image'
  | 'text'
  | '3d-text'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'path'
  | 'magic-layer';

/** Shadow applied to any poster element via Fabric.js Shadow. */
export interface PosterShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface PosterElementBase {
  id: string;
  type: PosterElementType;
  /** Optional custom layer name shown in the Layers panel. */
  layerName?: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  zIndex: number;
  shadow?: PosterShadow;
  /** When true, element cannot be moved, scaled, or rotated on the canvas. */
  locked?: boolean;
}

/**
 * Color / lighting / sharpness adjustments applied via Fabric.js image filters.
 * Ranges: brightness/contrast/saturation -100..100, sharpness 0..100, hue -180..180, tint amount 0..100.
 */
export interface ImageAdjustments {
  adjustBrightness?: number;
  adjustContrast?: number;
  adjustSaturation?: number;
  adjustSharpness?: number;
  adjustBlur?: number;
  /** Hue shift in degrees (-180..180). 0 = no change. */
  adjustHue?: number;
  /** Tint color `#RRGGBB`; meaningful when adjustTintAmount > 0. */
  adjustTintColor?: string;
  /** Tint strength 0..100 (Fabric BlendColor tint alpha). 0 = off. */
  adjustTintAmount?: number;
}

export function getImageAdjustmentsKey(el: ImageAdjustments): string {
  const tint = (el.adjustTintColor ?? '').toLowerCase().replace(/\s/g, '');
  return [
    el.adjustBrightness ?? 0,
    el.adjustContrast ?? 0,
    el.adjustSaturation ?? 0,
    el.adjustSharpness ?? 0,
    el.adjustBlur ?? 0,
    el.adjustHue ?? 0,
    tint,
    el.adjustTintAmount ?? 0,
  ].join('|');
}

export function hasNonDefaultAdjustments(el: ImageAdjustments): boolean {
  return (
    (el.adjustBrightness ?? 0) !== 0 ||
    (el.adjustContrast ?? 0) !== 0 ||
    (el.adjustSaturation ?? 0) !== 0 ||
    (el.adjustSharpness ?? 0) !== 0 ||
    (el.adjustBlur ?? 0) !== 0 ||
    (el.adjustHue ?? 0) !== 0 ||
    (el.adjustTintAmount ?? 0) !== 0
  );
}

/** How the uploaded image is clipped (vector clipPath on Fabric). Shape masks override paper-tear. */
export type PosterImageMask = 'none' | 'circle' | 'ellipse' | 'rounded-rect';

/**
 * Edge treatment: fade = vignette only; paper-tear = jagged clip;
 * fade-paper-tear = vignette on the bitmap then torn clip (no shape mask).
 */
export type PosterImageEdge = 'none' | 'fade' | 'paper-tear' | 'fade-paper-tear';

/** Soft fade: all edges (radial vignette) or only the bottom band. */
export type PosterImageFadeDirection = 'radial' | 'bottom';

export interface PosterImageElement extends PosterElementBase, ImageAdjustments {
  type: 'image';
  src: string;
  /** When set, tied to `/api/user-poster-images/:id` (e.g. library pick); updated on cloud save after edits. */
  userPosterImageId?: string;
  /** Original source before baking a mask; used for re-editing in mask editor. */
  originalSrc?: string;
  /** Optional texture overlay (e.g. paper, noise). */
  textureOverlay?: { textureId: string; opacity?: number };
  mask?: PosterImageMask;
  /** Soft edge fade (vignette) and/or paper-tear clip. */
  edge?: PosterImageEdge;
  /**
   * Fade strength 0–1 — how far the fade reaches inward (larger = more inward fade).
   * Default ~0.4.
   */
  edgeFadeAmount?: number;
  /**
   * Minimum opacity (0–1) at the outer limit of the fade. 0 = can fade to fully transparent;
   * higher values keep edges softer and less “cut off”. Default 0.
   */
  edgeFadeMinOpacity?: number;
  /** Where the soft fade applies; default radial (all sides). */
  edgeFadeDirection?: PosterImageFadeDirection;
  /** Seed for deterministic paper-tear jitter when edge uses paper tear. */
  edgeTearSeed?: number;
  /**
   * Corner radius for `rounded-rect` mask, as a fraction of min(image w, h), 0–0.5.
   * Default ~0.18.
   */
  maskCornerRadius?: number;
  /**
   * When a mask is applied: horizontal position of the image within the mask (0 = left, 0.5 = center, 1 = right).
   * Default 0.5.
   */
  maskImageOffsetX?: number;
  /**
   * When a mask is applied: vertical position of the image within the mask (0 = top, 0.5 = center, 1 = bottom).
   * Default 0.5.
   */
  maskImageOffsetY?: number;
  /**
   * When a mask is applied: scale of the image within the mask (1 = fill, >1 = zoom in).
   * Default 1.
   */
  maskImageScale?: number;
  /**
   * When a mask is applied: scale of the mask frame itself (1 = full element size).
   * <1 = smaller mask, >1 = larger mask. Does not affect image content inside.
   * Default 1.
   */
  maskScale?: number;
  /** Flip image horizontally (mirror left-right). */
  flipHorizontal?: boolean;
  /** Flip image vertically (mirror top-bottom). */
  flipVertical?: boolean;
}

/**
 * Optional mask / edge / flip fields shared with poster images.
 * 3D text is a raster bitmap on the canvas and uses the same Fabric image pipeline.
 */
export type PosterRasterStyleFields = Partial<
  Pick<
    PosterImageElement,
    | 'mask'
    | 'edge'
    | 'edgeFadeAmount'
    | 'edgeFadeMinOpacity'
    | 'edgeFadeDirection'
    | 'edgeTearSeed'
    | 'maskCornerRadius'
    | 'maskImageOffsetX'
    | 'maskImageOffsetY'
    | 'maskImageScale'
    | 'maskScale'
    | 'flipHorizontal'
    | 'flipVertical'
    | 'textureOverlay'
    | 'originalSrc'
  >
>;

export type PosterTextAlign = 'left' | 'center' | 'right';

export interface PosterTextElement extends PosterElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  /** Solid color (used when fillGradient and fillPattern are not set). */
  fill: string;
  /** Optional gradient fill; when set, overrides solid fill. */
  fillGradient?: Extract<PosterShapeFill, { type: 'linear' }> | Extract<PosterShapeFill, { type: 'radial' }>;
  /** Optional texture/pattern fill; when set, overrides solid and gradient. */
  fillPattern?: { textureId: string; repeat?: PatternRepeat; scale?: number };
  /** Textbox width in canvas units (Fabric `width`). Defaults to 200 if absent. */
  width?: number;
  /** Fabric: `'normal'` | `'bold'` or numeric weight. */
  fontWeight?: string | number;
  /** Fabric: `'normal'` | `'italic'` */
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  /** Strikethrough (Fabric `linethrough`). */
  linethrough?: boolean;
  /**
   * Extra space between characters (Fabric `charSpacing`): thousandths of 1em of the font size.
   * e.g. `100` ≈ 0.1em; `0` is default.
   */
  charSpacing?: number;
  /**
   * Row spacing / line height multiplier (Fabric `lineHeight`).
   * `1` is tight; higher values add more space between lines. Default Fabric value is ~1.16.
   */
  lineHeight?: number;
  /** Horizontal text alignment within the textbox. Default `'left'`. */
  textAlign?: PosterTextAlign;
  /** Outline/stroke color. When set with strokeWidth > 0, draws an outline. */
  stroke?: string;
  /** Outline width in pixels. Default 0. */
  strokeWidth?: number;
  /** Fill opacity 0–1. Use 0 for outline-only text. Default 1. */
  fillOpacity?: number;
}

export interface Poster3DTextElement extends PosterElementBase, ImageAdjustments, PosterRasterStyleFields {
  type: '3d-text';
  /** Raster shown on poster: HTTPS (library / cloud), data URL, or blob URL. */
  image: string;
  config: Partial<EditorState>; // Full 3D editor config for re-editing
  /** When set, re-exports PATCH this row in `/api/user-poster-images` instead of creating a duplicate. */
  userPosterImageId?: string;
}

export interface GradientStop {
  offset: number;
  color: string;
}

/** Pattern repeat mode for texture fills. */
export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';

/** Fill for poster rectangles/circles (solid, gradient, or pattern in shape space). */
export type PosterShapeFill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] }
  | { type: 'pattern'; textureId: string; repeat?: PatternRepeat; scale?: number };

export interface PosterShapeElement extends PosterElementBase {
  type: 'rect' | 'circle' | 'triangle' | 'ellipse' | 'line' | 'polygon';
  /** Solid hex string (legacy) or structured fill with gradients. */
  fill: string | PosterShapeFill;
  width?: number;
  height?: number;
  radius?: number;
  /** Rectangle corner radius (px); both rx/ry in Fabric (uniform corners). */
  rx?: number;
  /**
   * Per-corner radii (px) for `rect` when corners are not uniform.
   * When present, the shape is rendered as a Path (Fabric `Rect` only supports one radius).
   */
  rectCornerRadii?: { tl?: number; tr?: number; br?: number; bl?: number };
  /** Ellipse radii (Fabric `rx` / `ry`). */
  ry?: number;
  /** Line endpoints in object space (see Fabric `Line`). */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /**
   * Optional bezier control point for `line` type.
   * When set, the line is drawn as a quadratic curve from (x1,y1) via (x,y) to (x2,y2).
   */
  curveControl?: { x: number; y: number };
  /** Stroke width for `line` type; outline width for filled shapes (rect, circle, etc.). */
  strokeWidth?: number;
  /**
   * Outline color for filled shapes. When set with strokeWidth > 0, draws a visible border.
   * Line type uses fill for color; stroke is derived from fill.
   */
  stroke?: string;
  /** Fill opacity 0–1. Only affects the fill; outline (stroke) stays fully opaque. */
  fillOpacity?: number;
  /** Closed polygon vertices in local coordinates (top-left of bbox at 0,0). */
  polygonPoints?: { x: number; y: number }[];
}

export interface PosterPathPoint {
  x: number;
  y: number;
  /** Optional incoming bezier handle (local coordinates). */
  inX?: number;
  inY?: number;
  /** Optional outgoing bezier handle (local coordinates). */
  outX?: number;
  outY?: number;
}

export interface PosterPathElement extends PosterElementBase {
  type: 'path';
  fill: string | PosterShapeFill;
  /** Optional outline color. When unset or strokeWidth=0, outline is hidden. */
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  /** Anchor points in local shape coordinates. */
  pathPoints: PosterPathPoint[];
  /** Optional additional sub-paths (islands/holes). */
  islands?: PosterPathPoint[][];
  /** SVG fill rule for multiple paths (holes). */
  fillRule?: 'nonzero' | 'evenodd';
  /** Closed path when true. */
  closed?: boolean;
}

export interface MagicLayer {
  id: string;
  sourceObjectId: string;
  sourceImageData: ImageData;
  isolatedCanvas: HTMLCanvasElement;
  alphaMask: Uint8ClampedArray;
  contourPath: PosterPathPoint[];
  islands?: PosterPathPoint[][];
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  featherRadius?: number;
  editable: boolean;
  visible: boolean;
  locked: boolean;
  blendMode?: GlobalCompositeOperation;
  createdAt: number;
  createdFrom?: 'sam' | 'manual';
}

export interface MagicLayerStore {
  magicLayers: MagicLayer[];
  activeMagicLayerId: string | null;
  brushSettings: {
    radius: number;
    hardness: number;
    strength: number;
    mode: 'add' | 'subtract';
  };
  setBrushSettings(settings: Partial<MagicLayerStore['brushSettings']>): void;
  createMagicLayerFromSelection(): Promise<void>;
  updateMagicLayerMask(id: string, mask: Uint8ClampedArray): void;
  refineMagicLayer(id: string): void;
  deleteMagicLayer(id: string): void;
  duplicateMagicLayer(id: string): void;
  reorderMagicLayer(id: string, newIndex: number): void;
  commitMagicLayer(id: string): void;
  toggleMagicLayerVisibility(id: string): void;
  setActiveMagicLayer(id: string | null): void;
  registerMagicLayer(layer: MagicLayer): void;
  createMagicLayersFromSam(elementId: string): Promise<void>;
}

export interface MagicLayerElement extends PosterElementBase {
  type: 'magic-layer';
  sourceObjectId: string;
  /** Base64 or URL to the extracted canvas. */
  isolatedSrc: string;
  /** Original source image data for non-destructive edits (stored as URL/Blob). */
  sourceSrc: string;
  alphaMask?: Uint8ClampedArray;
  contourPath: PosterPathPoint[];
  islands?: PosterPathPoint[][];
  featherRadius?: number;
  blendMode?: GlobalCompositeOperation;
}

export type PosterElement =
  | PosterImageElement
  | PosterTextElement
  | Poster3DTextElement
  | PosterShapeElement
  | PosterPathElement
  | MagicLayerElement;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Payload accepted when creating an element; preserves each union member's specific fields. */
export type PosterElementInput = DistributiveOmit<PosterElement, 'id' | 'zIndex'>;

export type CanvasBackground =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] }
  | { type: 'conic'; angle: number; cx: number; cy: number; stops: GradientStop[] };

export function isSolidBackground(bg: CanvasBackground): bg is { type: 'solid'; color: string } {
  return bg.type === 'solid';
}

export function canvasBackgroundToCss(bg: CanvasBackground, w: number, h: number): string {
  if (bg.type === 'solid') return bg.color;
  const stopsStr = bg.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ');
  if (bg.type === 'linear') {
    return `linear-gradient(${bg.angle}deg, ${stopsStr})`;
  }
  if (bg.type === 'radial') {
    return `radial-gradient(circle at ${bg.cx * 100}% ${bg.cy * 100}%, ${stopsStr})`;
  }
  return `conic-gradient(from ${bg.angle}deg at ${bg.cx * 100}% ${bg.cy * 100}%, ${stopsStr})`;
}

export function canvasBackgroundToCanvas2D(
  ctx: CanvasRenderingContext2D,
  bg: CanvasBackground,
  w: number,
  h: number
): void {
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.type === 'linear') {
    const rad = (bg.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x0 = w * (0.5 - cos * 0.5);
    const y0 = h * (0.5 - sin * 0.5);
    const x1 = w * (0.5 + cos * 0.5);
    const y1 = h * (0.5 + sin * 0.5);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    bg.stops.forEach((s) => g.addColorStop(s.offset, s.color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.type === 'radial') {
    const cx = bg.cx * w;
    const cy = bg.cy * h;
    const r = Math.max(w, h) * bg.r;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.stops.forEach((s) => g.addColorStop(s.offset, s.color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.type === 'conic') {
    const cx = bg.cx * w;
    const cy = bg.cy * h;
    const startAngle = (bg.angle * Math.PI) / 180;
    const conicFactory = (
      ctx as CanvasRenderingContext2D & {
        createConicGradient?: (angle: number, x: number, y: number) => CanvasGradient;
      }
    ).createConicGradient;
    const g =
      typeof conicFactory === 'function'
        ? conicFactory.call(ctx, startAngle, cx, cy)
        : ctx.createLinearGradient(0, 0, w, 0);
    bg.stops.forEach((s) => g.addColorStop(s.offset, s.color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
}

export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
  { offset: 0, color: '#ffffff' },
  { offset: 1, color: '#64748b' },
];

export interface PosterProject {
  elements: PosterElement[];
  canvasWidth: number;
  canvasHeight: number;
  canvasBackgroundColor?: string;
  canvasBackground?: CanvasBackground;
}
