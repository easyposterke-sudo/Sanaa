import type { PosterReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import type { PosterElement } from '../types';
import { compilePosterReconstruction } from './compilePosterReconstruction';

export async function applyPosterElementEdit(input: {
  elements: PosterElement[];
  selectedId: string;
  patch: PosterReconstructionPlan;
  reference: { dataUrl: string; width: number; height: number; originalDataUrl?: string };
  canvasWidth: number;
  canvasHeight: number;
  fontCatalogFamilies?: Readonly<Record<string, string>>;
}): Promise<{ elements: PosterElement[]; replacementIds: string[] }> {
  const selected = input.elements.find((element) => element.id === input.selectedId);
  if (!selected) throw new Error('The selected layer is no longer available.');
  if (selected.locked) throw new Error('Unlock this layer before editing it with AI.');
  if (input.patch.elements.length < 1 || input.patch.elements.length > 8) {
    throw new Error('The AI edit must contain between 1 and 8 replacement layers.');
  }
  // Reject unsupported contours before the compiler's general-purpose rectangular
  // fallback can silently turn an attempted correction into a different shape.
  for (const item of input.patch.elements) {
    if (item.kind !== 'path') continue;
    const closed = item.pathUsage === 'closed_fill' ||
      (item.pathUsage === 'not_applicable' && item.pathClosed) ||
      (item.pathUsage === 'open_stroke' && item.fill !== null && (!item.stroke || item.strokeWidthRatio <= 0));
    const points = item.fidelity?.path?.nodes ?? item.pathPoints;
    if (points.length < (closed ? 3 : 2) || new Set(points.map(point => `${point.x},${point.y}`)).size < (closed ? 3 : 2)) {
      throw new Error('The AI returned an incomplete path. Your original layer has been kept; try describing the contour more specifically.');
    }
  }

  const compiled = await compilePosterReconstruction({
    plan: input.patch,
    reference: input.reference,
    canvasSize: { width: input.canvasWidth, height: input.canvasHeight },
    referenceGuideOpacity: 0,
    fontCatalogFamilies: input.fontCatalogFamilies,
    layoutMode: 'reference',
  });
  if (compiled.project.elements.length < 1) {
    throw new Error('The AI edit did not produce an editable replacement.');
  }

  const occupied = new Set(input.elements.map(({ id }) => id));
  occupied.delete(selected.id);
  const replacementIds: string[] = [];
  const replacements = compiled.project.elements.map((element, index) => {
    // Preserve editor-only treatments when the response cannot represent them.
    // Explicit fidelity effects, including null, are intentional replacements.
    const source = input.patch.elements[index];
    const preserved: Partial<PosterElement> = {};
    if (compiled.project.elements.length === 1 && element.type === selected.type) {
      if (!source?.fidelity && selected.shadow) preserved.shadow = selected.shadow;
      preserved.reconstructionKey = selected.reconstructionKey;
      preserved.reconstructionGroup = selected.reconstructionGroup;
      if (element.type === 'text' && selected.type === 'text') {
        element.fillPattern = selected.fillPattern;
        element.taper = selected.taper;
        if (!source?.fidelity) {
          element.textBackground = selected.textBackground;
          element.underline = selected.underline;
          element.linethrough = selected.linethrough;
          element.fillOpacity = selected.fillOpacity;
          if (selected.fillGradient?.type === 'radial') element.fillGradient = selected.fillGradient;
        }
      }
    }
    let id = index === 0 ? selected.id : `${selected.id}_ai_${index + 1}`;
    let suffix = 2;
    while (occupied.has(id)) id = `${selected.id}_ai_${index + 1}_${suffix++}`;
    occupied.add(id);
    replacementIds.push(id);
    return {
      ...element,
      ...preserved,
      id,
      zIndex: selected.zIndex + index * 0.001,
    } as PosterElement;
  });

  return {
    elements: input.elements.flatMap((element) =>
      element.id === selected.id ? replacements : [element],
    ),
    replacementIds,
  };
}

export function sanitizedPosterElementProperties(element: PosterElement): string {
  const serialized = JSON.stringify(element, (key, value) => {
    if (key === 'src' || key === 'image' || key === 'originalSrc') return undefined;
    if (typeof value === 'string' && value.startsWith('data:')) return undefined;
    return value;
  });
  if (serialized.length <= 16_000) return serialized;
  return JSON.stringify({
    id: element.id,
    type: element.type,
    layerName: element.layerName,
    left: element.left,
    top: element.top,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    angle: element.angle,
    opacity: element.opacity,
    zIndex: element.zIndex,
    ...(element.type === 'text'
      ? {
          text: element.text,
          fontFamily: element.fontFamily,
          fontSize: element.fontSize,
          fontWeight: element.fontWeight,
          fontStyle: element.fontStyle,
          charSpacing: element.charSpacing,
          lineHeight: element.lineHeight,
          textAlign: element.textAlign,
          fill: element.fill,
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
          width: element.width,
        }
      : {}),
  });
}
