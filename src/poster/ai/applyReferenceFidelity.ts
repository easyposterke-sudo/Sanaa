import type { ReferenceGradient, ReferencePathNode } from '../../../shared/ai/referenceFidelity';
import type { ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PosterElement, PosterPathPoint, PosterShapeFill } from '../types';

export function referenceGradientFill(gradient: ReferenceGradient): Extract<PosterShapeFill, { type: 'linear' | 'radial' }> {
  const stops = [...gradient.stops].sort((a, b) => a.offset - b.offset).map(stop => ({ offset: stop.offset, color: colorWithOpacity(stop.color, stop.opacity) }));
  return gradient.type === 'linear'
    ? { type: 'linear', angle: gradient.angle, stops }
    : { type: 'radial', cx: gradient.cx, cy: gradient.cy, r: gradient.radius, stops };
}

export function colorWithOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

export function referencePathPoints(nodes: ReferencePathNode[], width: number, height: number): PosterPathPoint[] {
  return nodes.map(node => ({
    x: node.x * width, y: node.y * height,
    ...(node.incoming ? { inX: node.incoming.x * width, inY: node.incoming.y * height } : {}),
    ...(node.outgoing ? { outX: node.outgoing.x * width, outY: node.outgoing.y * height } : {}),
  }));
}

export function applyReferenceFidelity(element: PosterElement, item: ReconstructionElement, width: number, height: number, canvasHeight: number, referenceHeight: number): PosterElement {
  const fidelity = item.fidelity;
  if (!fidelity || element.type === 'image' || element.type === '3d-text') return element;
  const result = { ...element, reconstructionKey: item.key, reconstructionGroup: fidelity.groupKey ?? undefined };
  if (fidelity.shadow) {
    result.shadow = {
      color: colorWithOpacity(fidelity.shadow.color, fidelity.shadow.opacity),
      blur: fidelity.shadow.blurRatio * canvasHeight,
      offsetX: fidelity.shadow.offsetXRatio * canvasHeight,
      offsetY: fidelity.shadow.offsetYRatio * canvasHeight,
    };
  }
  const gradient = fidelity.gradient ? referenceGradientFill(fidelity.gradient) : undefined;
  if (result.type === 'text') {
    if (gradient) result.fillGradient = gradient;
    result.fillOpacity = fidelity.fillOpacity;
    result.underline = fidelity.underline;
    result.linethrough = fidelity.linethrough;
    if (fidelity.textBackground) {
      const scale = canvasHeight / Math.max(1, referenceHeight);
      result.textBackground = {
        ...fidelity.textBackground,
        outlineWidth: fidelity.textBackground.outlineWidth * scale,
        blur: fidelity.textBackground.blur * scale,
      };
    }
  } else if (result.type !== 'magic-layer') {
    const openPath = result.type === 'path' && !result.closed;
    if (gradient && !openPath) result.fill = gradient;
    result.fillOpacity = openPath ? 0 : fidelity.fillOpacity;
    if (result.type === 'rect' && fidelity.cornerRadii) {
      const size = Math.min(width, height);
      result.rectCornerRadii = Object.fromEntries(Object.entries(fidelity.cornerRadii).map(([key, value]) => [key, value * size]));
    }
    if (result.type === 'path' && fidelity.path && fidelity.path.nodes.length >= (result.closed ? 3 : 2)) {
      result.pathPoints = referencePathPoints(fidelity.path.nodes, width, height);
      result.islands = fidelity.path.holes.map(nodes => referencePathPoints(nodes, width, height));
      result.fillRule = fidelity.path.fillRule;
    }
  }
  return result;
}
