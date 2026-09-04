import type { FabricObject } from 'fabric';
import type { PosterShapeFill } from './types';

type GlassFill = Extract<PosterShapeFill, { type: 'glass' }>;

interface GlassRenderable extends FabricObject {
  _render(context: CanvasRenderingContext2D): void;
  _renderPathCommands?: (context: CanvasRenderingContext2D) => void;
  rx?: number;
  ry?: number;
}

const originalRenderKey = Symbol('posterGlassOriginalRender');
const glassSettingsKey = Symbol('posterGlassSettings');
const originalObjectCachingKey = Symbol('posterGlassOriginalObjectCaching');

type GlassWrappedObject = GlassRenderable & {
  [originalRenderKey]?: (context: CanvasRenderingContext2D) => void;
  [glassSettingsKey]?: { fill: GlassFill; opacity: number };
  [originalObjectCachingKey]?: boolean;
};

/** Adds an export-safe backdrop-blur renderer to a Fabric vector instance. */
export function setFabricObjectGlassFill(
  object: FabricObject,
  fill: GlassFill | undefined,
  opacity = 1,
): void {
  const wrapped = object as GlassWrappedObject;
  wrapped[glassSettingsKey] = fill
    ? { fill, opacity: Math.max(0, Math.min(1, opacity)) }
    : undefined;

  // Backdrop glass must render on the main canvas so it can copy the layers
  // already painted behind the shape. Fabric's object cache is transparent and
  // isolated, so blurring that cache produces no visible change.
  if (fill) {
    if (wrapped[originalObjectCachingKey] === undefined) {
      wrapped[originalObjectCachingKey] = wrapped.objectCaching;
    }
    wrapped.objectCaching = false;
  } else if (wrapped[originalObjectCachingKey] !== undefined) {
    wrapped.objectCaching = wrapped[originalObjectCachingKey];
    delete wrapped[originalObjectCachingKey];
  }

  if (fill && !wrapped[originalRenderKey]) {
    const originalRender = wrapped._render.bind(wrapped);
    wrapped[originalRenderKey] = originalRender;
    wrapped._render = function renderGlassVector(context: CanvasRenderingContext2D): void {
      const settings = this[glassSettingsKey];
      if (!settings) {
        originalRender(context);
        return;
      }

      renderGlassFill(context, this, settings.fill, settings.opacity);
      const previousFill = this.fill;
      try {
        this.fill = 'transparent';
        originalRender(context);
      } finally {
        this.fill = previousFill;
      }
    };
  }
  wrapped.dirty = true;
}

function renderGlassFill(
  context: CanvasRenderingContext2D,
  object: GlassRenderable,
  fill: GlassFill,
  opacity: number,
): void {
  const fillRule: CanvasFillRule = object.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
  const inheritedAlpha = context.globalAlpha;
  context.save();
  const blurred = drawBlurredBackdrop(context, object, fill.blur, fillRule);
  if (traceObjectPath(context, object)) {
    context.globalAlpha = inheritedAlpha * opacity * (blurred ? 0.38 : 0.58);
    context.fillStyle = fill.color;
    context.fill(fillRule);

    if (traceObjectPath(context, object)) {
      context.globalAlpha = inheritedAlpha * Math.min(0.75, 0.18 + opacity * 0.28);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1;
      context.stroke();
    }
  }
  context.restore();
}

/** Copies already-painted lower layers, blurs them, then clips them to this vector. */
function drawBlurredBackdrop(
  context: CanvasRenderingContext2D,
  object: GlassRenderable,
  blur: number,
  fillRule: CanvasFillRule,
): boolean {
  if (blur <= 0 || typeof document === 'undefined') return false;
  try {
    const width = Math.max(1, object.width || 1);
    const height = Math.max(1, object.height || 1);
    const x = -width / 2;
    const y = -height / 2;
    const transform = context.getTransform();
    const corners = [
      transformPoint(transform, x, y),
      transformPoint(transform, x + width, y),
      transformPoint(transform, x + width, y + height),
      transformPoint(transform, x, y + height),
    ];
    const scale = Math.max(
      Math.hypot(transform.a, transform.b),
      Math.hypot(transform.c, transform.d),
      0.1,
    );
    const blurPixels = blur * scale;
    const margin = Math.ceil(blurPixels * 2);
    const minimumX = Math.floor(Math.min(...corners.map((point) => point.x)) - margin);
    const minimumY = Math.floor(Math.min(...corners.map((point) => point.y)) - margin);
    const maximumX = Math.ceil(Math.max(...corners.map((point) => point.x)) + margin);
    const maximumY = Math.ceil(Math.max(...corners.map((point) => point.y)) + margin);
    const sourceX = Math.max(0, minimumX);
    const sourceY = Math.max(0, minimumY);
    const sourceRight = Math.min(context.canvas.width, maximumX);
    const sourceBottom = Math.min(context.canvas.height, maximumY);
    const sourceWidth = Math.max(1, sourceRight - sourceX);
    const sourceHeight = Math.max(1, sourceBottom - sourceY);
    const buffer = document.createElement('canvas');
    buffer.width = sourceWidth;
    buffer.height = sourceHeight;
    const bufferContext = buffer.getContext('2d');
    if (!bufferContext) return false;
    bufferContext.drawImage(
      context.canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    context.save();
    if (!traceObjectPath(context, object)) {
      context.restore();
      return false;
    }
    context.clip(fillRule);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = `blur(${blurPixels}px)`;
    context.drawImage(buffer, sourceX, sourceY);
    context.restore();
    return true;
  } catch {
    return false;
  }
}

/** Replays the exact Fabric vector path in the object's centered render coordinates. */
function traceObjectPath(context: CanvasRenderingContext2D, object: GlassRenderable): boolean {
  context.beginPath();
  if (typeof object._renderPathCommands === 'function') {
    object._renderPathCommands(context);
    return true;
  }

  const width = Math.max(1, object.width || 1);
  const height = Math.max(1, object.height || 1);
  const left = -width / 2;
  const top = -height / 2;
  switch (object.type) {
    case 'rect': {
      const radiusX = Math.min(Math.max(0, object.rx ?? 0), width / 2);
      const radiusY = Math.min(Math.max(0, object.ry ?? radiusX), height / 2);
      if (radiusX === 0 && radiusY === 0) {
        context.rect(left, top, width, height);
      } else {
        const right = left + width;
        const bottom = top + height;
        context.moveTo(left + radiusX, top);
        context.lineTo(right - radiusX, top);
        context.quadraticCurveTo(right, top, right, top + radiusY);
        context.lineTo(right, bottom - radiusY);
        context.quadraticCurveTo(right, bottom, right - radiusX, bottom);
        context.lineTo(left + radiusX, bottom);
        context.quadraticCurveTo(left, bottom, left, bottom - radiusY);
        context.lineTo(left, top + radiusY);
        context.quadraticCurveTo(left, top, left + radiusX, top);
        context.closePath();
      }
      return true;
    }
    case 'circle':
      context.arc(0, 0, width / 2, 0, Math.PI * 2);
      context.closePath();
      return true;
    case 'ellipse':
      context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.closePath();
      return true;
    case 'triangle':
      context.moveTo(0, top);
      context.lineTo(width / 2, height / 2);
      context.lineTo(-width / 2, height / 2);
      context.closePath();
      return true;
    default:
      return false;
  }
}

function transformPoint(transform: DOMMatrix, x: number, y: number): { x: number; y: number } {
  return {
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  };
}
