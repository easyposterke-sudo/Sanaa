import { Rect, Circle, Triangle, Ellipse, Line, Polygon, Path, FabricImage, Textbox, Shadow } from 'fabric';
import type { PosterElement, PosterTextElement, Poster3DTextElement, PosterShapeElement, PosterImageElement, PosterShadow, PosterPathElement, PosterPathPoint } from './types';
import { usePosterStore } from './store/posterStore';
import { normalizePosterShapeFill, posterShapeFillToFabric, posterPatternFillToFabric, applyColorOpacity } from './shapeFillFabric';
import { resolvePosterImageFabricSrc, applyPosterImageClipPath } from './imageEffects';
import { getPosterShapeLocalSize, lineStrokeFromFill, shapeFillFallbackForType } from './posterShapeGeometry';
import { rectHasPerCornerRadii, roundedRectPathD, perCornerRadiiFromShape } from './roundedRectPath';
import { pathPointsToPathD } from './path/penToolMath';
import { applyImageFlip, getMaskedImageScale } from './posterImageFabricLayout';
import { buildPosterTextEffectStyles, posterTextEffectPadding } from './textEffects';
import { DynamicBackgroundTextbox } from './DynamicBackgroundTextbox';
import { posterTransformAppearance } from './posterTransformControls';

function toFabricShadow(s?: PosterShadow): Shadow | null {
  return s ? new Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY }) : null;
}

function getPathLocalSize(points: PosterPathPoint[], islands?: PosterPathPoint[][]): { w: number; h: number } {
  const allPts = [points, ...(islands ?? [])].flat();
  if (!allPts.length) return { w: 100, h: 100 };
  const xs = allPts.map((p) => p.x);
  const ys = allPts.map((p) => p.y);
  return {
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

export async function createFabricObject(
  el: PosterElement,
  readOnly = false
): Promise<
  | InstanceType<typeof Rect>
  | InstanceType<typeof Path>
  | InstanceType<typeof Circle>
  | InstanceType<typeof Triangle>
  | InstanceType<typeof Ellipse>
  | InstanceType<typeof Line>
  | InstanceType<typeof Polygon>
  | InstanceType<typeof FabricImage>
  | InstanceType<typeof Textbox>
  | null
> {
  const locked = !!el.locked;
  // Fabric 7+ defaults to originX/originY 'center' - use 'left'/'top' so left/top match our stored coords
  // When locked or readOnly: prevent move/scale/rotate but keep selectable so user can select
  const lockAll = locked || readOnly;
  const common: Record<string, unknown> = {
    ...posterTransformAppearance(el.type === 'text'),
    left: el.left,
    top: el.top,
    scaleX: el.scaleX,
    scaleY: el.scaleY,
    angle: el.angle,
    opacity: el.opacity,
    selectable: true,
    evented: true,
    lockMovementX: lockAll,
    lockMovementY: lockAll,
    lockScalingX: lockAll,
    lockScalingY: lockAll,
    lockRotation: lockAll,
    originX: 'left' as const,
    originY: 'top' as const,
  };
  const fs = toFabricShadow(el.shadow);
  if (fs) common.shadow = fs;

  async function resolveShapeFill(
    shape: PosterShapeElement,
    w: number,
    h: number
  ): Promise<ReturnType<typeof posterShapeFillToFabric>> {
    const norm = normalizePosterShapeFill(shape.fill, shapeFillFallbackForType(shape.type));
    const fillOpacity = shape.fillOpacity ?? 1;
    if (norm.type === 'glass') return 'transparent';
    if (norm.type === 'pattern') {
      return posterPatternFillToFabric(
        norm.textureId,
        norm.repeat ?? 'repeat',
        norm.scale ?? 1
      );
    }
    return posterShapeFillToFabric(norm, w, h, fillOpacity);
  }

  switch (el.type) {
    case 'rect': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 80;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      if (rectHasPerCornerRadii(shape)) {
        const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
        const d = roundedRectPathD(w, h, tl, tr, br, bl);
        return new Path(d, {
          ...common,
          fill: fillValue,
          stroke,
          strokeWidth,
        });
      }
      const maxR = Math.min(w, h) / 2;
      const rx = Math.min(Math.max(0, shape.rx ?? 0), maxR);
      return new Rect({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
        rx,
        ry: rx,
      });
    }
    case 'circle': {
      const shape = el as PosterShapeElement;
      const r = shape.radius ?? 50;
      const d = r * 2;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, d, d);
      return new Circle({
        ...common,
        radius: r,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'triangle': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 100;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Triangle({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'ellipse': {
      const shape = el as PosterShapeElement;
      const rx = shape.rx ?? 60;
      const ry = shape.ry ?? 40;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, rx * 2, ry * 2);
      return new Ellipse({
        ...common,
        rx,
        ry,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'line': {
      const shape = el as PosterShapeElement;
      const fb = shapeFillFallbackForType('line');
      const stroke = lineStrokeFromFill(shape.fill, fb);
      const sw = shape.strokeWidth ?? 4;
      const x1 = shape.x1 ?? 0;
      const y1 = shape.y1 ?? 0;
      const x2 = shape.x2 ?? 120;
      const y2 = shape.y2 ?? 80;
      if (shape.curveControl) {
        const c = shape.curveControl;
        const d = `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`;
        return new Path(d, {
          ...common,
          stroke,
          strokeWidth: sw,
          fill: '',
        });
      }
      return new Line([x1, y1, x2, y2], {
        ...common,
        stroke,
        strokeWidth: sw,
        fill: '',
      });
    }
    case 'polygon': {
      const shape = el as PosterShapeElement;
      const pts = shape.polygonPoints?.length
        ? shape.polygonPoints.map((p) => ({ x: p.x, y: p.y }))
        : [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ];
      const { w, h } = getPosterShapeLocalSize(shape);
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Polygon(pts, {
        ...common,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'path': {
      const pathEl = el as PosterPathElement;
      const d = pathPointsToPathD(pathEl.pathPoints, pathEl.closed ?? false, pathEl.islands);
      const size = getPathLocalSize(pathEl.pathPoints, pathEl.islands);
      const fillNorm = normalizePosterShapeFill(pathEl.fill, '#14b8a6');
      const fillOpacity = pathEl.fillOpacity ?? 1;
      const fillValue =
        fillNorm.type === 'glass'
          ? 'transparent'
          : fillNorm.type === 'pattern'
            ? await posterPatternFillToFabric(
                fillNorm.textureId,
                fillNorm.repeat ?? 'repeat',
                fillNorm.scale ?? 1
              )
            : posterShapeFillToFabric(fillNorm, size.w, size.h, fillOpacity);
      const stroke = pathEl.stroke && (pathEl.strokeWidth ?? 0) > 0 ? pathEl.stroke : '';
      const strokeWidth = stroke ? (pathEl.strokeWidth ?? 2) : 0;
      return new Path(d, {
        ...common,
        fill: fillValue,
        stroke,
        strokeWidth,
        fillRule: pathEl.fillRule ?? 'nonzero',
        objectCaching: false,
      });
    }
    case 'text': {
      const t = el as PosterTextElement;
      const fillOpacity = t.fillOpacity ?? 1;
      let textFill: string | Awaited<ReturnType<typeof posterPatternFillToFabric>> | ReturnType<typeof posterShapeFillToFabric> = t.fill ?? '#000000';
      if (t.fillPattern?.textureId && fillOpacity > 0) {
        textFill = await posterPatternFillToFabric(
          t.fillPattern.textureId,
          t.fillPattern.repeat ?? 'repeat',
          t.fillPattern.scale ?? 1
        );
      } else if (t.fillPattern?.textureId) {
        textFill = 'transparent';
      } else if (t.fillGradient) {
        const w = t.width ?? 200;
        const h = Math.max(50, (t.fontSize ?? 24) * 2);
        textFill = posterShapeFillToFabric(t.fillGradient, w, h, fillOpacity);
      } else if (typeof textFill === 'string') {
        textFill = fillOpacity <= 0 ? 'transparent' : applyColorOpacity(textFill, fillOpacity);
      }
      const stroke = t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : undefined;
      const strokeWidth = stroke ? (t.strokeWidth ?? 2) : 0;
      const { activeTool } = usePosterStore.getState();
      const text = new DynamicBackgroundTextbox(t.text, {
        ...common,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fill: textFill,
        stroke: stroke ?? null,
        strokeWidth,
        paintFirst: strokeWidth > 0 ? ('stroke' as const) : ('fill' as const),
        width: t.width ?? 200,
        fontWeight: t.fontWeight ?? 'normal',
        fontStyle: t.fontStyle ?? 'normal',
        underline: t.underline ?? false,
        linethrough: t.linethrough ?? false,
        charSpacing: t.charSpacing ?? 0,
        lineHeight: t.lineHeight ?? 1.16,
        textAlign: t.textAlign ?? 'left',
        styles: buildPosterTextEffectStyles(
          t.text,
          t.fontSize,
          t.curve ?? 0,
          t.taper ?? 0,
        ),
        padding: posterTextEffectPadding(t.fontSize, t.curve ?? 0),
        objectCaching: false,
      });
      text.editable = !readOnly && (activeTool === 'text' || activeTool === 'select');
      text.setPosterTextBackground(
        t.textBackground,
        posterTextEffectPadding(t.fontSize, t.curve ?? 0),
      );
      return text;
    }
    case 'image':
    case '3d-text': {
      const raster = el as PosterImageElement | Poster3DTextElement;
      try {
        const url = await resolvePosterImageFabricSrc(raster);
        const opts = /^https?:\/\//i.test(url) ? { crossOrigin: 'anonymous' as const } : undefined;
        const img = await FabricImage.fromURL(url, opts);
        const w = img.width ?? 1;
        const h = img.height ?? 1;
        const baseScale =
          (raster.mask ?? 'none') !== 'none' ? getMaskedImageScale(raster, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
        const scale = applyImageFlip(baseScale, raster);
        img.set({
          ...common,
          scaleX: scale.scaleX,
          scaleY: scale.scaleY,
        });
        applyPosterImageClipPath(img, raster);
        return img;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
