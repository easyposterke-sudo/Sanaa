import {
  PosterReconstructionPlanSchema,
  type PosterReconstructionPlan,
  type ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import type { PosterTemplateCategory, PosterTemplateFieldBinding } from '../templateTypes';
import type {
  CanvasBackground,
  PosterElement,
  PosterImageElement,
  PosterProject,
  PosterShapeElement,
  PosterTextElement,
} from '../types';

type PixelBox = { left: number; top: number; width: number; height: number };

export interface CompiledPosterReconstruction {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
  suggestedTemplateName: string;
  category: PosterTemplateCategory;
  description: string;
  warnings: string[];
}

const FONT_STACKS: Record<PosterReconstructionPlan['elements'][number]['fontFamily'], string> = {
  arial: 'Arial, Helvetica, sans-serif',
  arial_black: 'Arial Black, Arial, sans-serif',
  bebas_neue: 'Bebas Neue, Impact, sans-serif',
  georgia: 'Georgia, serif',
  great_vibes: 'Great Vibes, cursive',
  impact: 'Impact, Arial Black, sans-serif',
  inter: 'Inter, Arial, sans-serif',
  montserrat: 'Montserrat, Arial, sans-serif',
  open_sans: 'Open Sans, Arial, sans-serif',
  oswald: 'Oswald, Arial, sans-serif',
  pacifico: 'Pacifico, cursive',
  playfair_display: 'Playfair Display, Georgia, serif',
  poppins: 'Poppins, Arial, sans-serif',
  roboto: 'Roboto, Arial, sans-serif',
  times_new_roman: 'Times New Roman, Times, serif',
};

export async function compilePosterReconstruction(input: {
  plan: PosterReconstructionPlan;
  reference: { dataUrl: string; width: number; height: number };
  referenceGuideOpacity?: number;
}): Promise<CompiledPosterReconstruction> {
  const plan = PosterReconstructionPlanSchema.parse(input.plan);
  const canvasWidth = input.reference.width;
  const canvasHeight = input.reference.height;
  const elements: PosterElement[] = [];
  const fields: PosterTemplateFieldBinding[] = [];
  const warnings = [...plan.warnings];
  const usedIds = new Set<string>();
  const usedFieldKeys = new Set<string>();
  let nextZ = 1;

  const guideOpacity = clamp(input.referenceGuideOpacity ?? 0.22, 0, 1);
  if (guideOpacity > 0) {
    elements.push({
      id: uniqueId('reconstruction_reference_guide', usedIds),
      layerName: 'REFERENCE GUIDE — replace or delete before saving',
      type: 'image',
      src: input.reference.dataUrl,
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: guideOpacity,
      zIndex: nextZ++,
      locked: true,
      mask: 'none',
      edge: 'none',
    });
    warnings.unshift('A locked reference guide is behind the reconstructed layers. Replace or delete it before publishing the template.');
  }

  const ordered = [...plan.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const item of ordered) {
    const box = pixelBox(item.box, canvasWidth, canvasHeight);
    const id = uniqueId(`reconstruction_${sanitizeKey(item.key)}`, usedIds);
    const base = {
      id,
      layerName: `AI draft: ${item.label}`,
      left: box.left,
      top: box.top,
      scaleX: 1,
      scaleY: 1,
      angle: item.angle,
      opacity: item.opacity,
      zIndex: nextZ++,
    };

    let element: PosterElement;
    if (item.kind === 'text') {
      element = compileTextElement(item, box, canvasHeight, base);
    } else if (item.kind === 'image_region') {
      const crop = await cropReferenceRegion(input.reference, box);
      element = {
        ...base,
        type: 'image',
        src: crop.dataUrl,
        scaleX: box.width / crop.width,
        scaleY: box.height / crop.height,
        mask: 'none',
        edge: 'none',
      } satisfies PosterImageElement;
    } else {
      element = compileShapeElement(item, box, canvasHeight, base);
    }
    elements.push(element);

    const fieldKey = item.suggestedFieldKey;
    if (
      fieldKey &&
      item.suggestedFieldLabel.trim() &&
      (element.type === 'text' || element.type === 'image') &&
      !usedFieldKeys.has(fieldKey)
    ) {
      usedFieldKeys.add(fieldKey);
      fields.push({
        key: fieldKey,
        label: item.suggestedFieldLabel.trim(),
        sourceElementId: id,
        kind: element.type === 'image' ? 'image' : 'text',
      });
    }

    if (item.confidence < 0.55) {
      warnings.push(`Review “${item.label}”; the AI reported low confidence.`);
    }
  }

  if (plan.elements.length === 0) {
    warnings.push('No editable layers were detected. Trace the locked reference guide manually.');
  }

  return {
    project: {
      canvasWidth,
      canvasHeight,
      canvasBackground: compileCanvasBackground(plan),
      elements,
    },
    fieldBindings: fields,
    suggestedTemplateName: plan.suggestedTemplateName,
    category: plan.category,
    description: plan.summary,
    warnings: [...new Set(warnings)],
  };
}

function compileCanvasBackground(plan: PosterReconstructionPlan): CanvasBackground {
  if (plan.canvas.backgroundType === 'solid') {
    return { type: 'solid', color: plan.canvas.backgroundTop };
  }
  return {
    type: 'linear',
    angle: plan.canvas.gradientAngle,
    stops: [
      { offset: 0, color: plan.canvas.backgroundTop },
      { offset: 1, color: plan.canvas.backgroundBottom },
    ],
  };
}

function compileTextElement(
  item: ReconstructionElement,
  box: PixelBox,
  canvasHeight: number,
  base: Pick<PosterTextElement, 'id' | 'layerName' | 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'zIndex'>,
): PosterTextElement {
  const lineCount = Math.max(1, item.text.split(/\r?\n/).length);
  const measuredSize = item.fontSizeRatio * canvasHeight;
  const boxLimitedSize = (box.height / lineCount) * 0.94;
  const fontSize = Math.max(6, Math.min(measuredSize, Math.max(8, boxLimitedSize)));
  return {
    ...base,
    type: 'text',
    text: item.text || item.label,
    fontSize,
    fontFamily: FONT_STACKS[item.fontFamily],
    fill: item.fill ?? '#111111',
    width: Math.max(12, box.width),
    fontWeight: item.fontWeight,
    fontStyle: item.fontStyle,
    charSpacing: item.charSpacing,
    lineHeight: item.lineHeight,
    textAlign: item.textAlign,
    stroke: item.stroke ?? undefined,
    strokeWidth: item.stroke ? item.strokeWidthRatio * canvasHeight : 0,
  };
}

function compileShapeElement(
  item: ReconstructionElement,
  box: PixelBox,
  canvasHeight: number,
  base: Pick<PosterShapeElement, 'id' | 'layerName' | 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'zIndex'>,
): PosterShapeElement {
  const common = {
    ...base,
    fill: item.fill ?? 'transparent',
    stroke: item.stroke ?? undefined,
    strokeWidth: item.stroke ? item.strokeWidthRatio * canvasHeight : 0,
  };
  if (item.kind === 'circle') {
    const diameter = Math.max(1, box.width);
    return {
      ...common,
      type: 'circle',
      radius: diameter / 2,
      scaleY: box.height / diameter,
    };
  }
  if (item.kind === 'ellipse') {
    return {
      ...common,
      type: 'ellipse',
      rx: Math.max(0.5, box.width / 2),
      ry: Math.max(0.5, box.height / 2),
    };
  }
  if (item.kind === 'line') {
    return {
      ...common,
      type: 'line',
      x1: 0,
      y1: box.height / 2,
      x2: box.width,
      y2: box.height / 2,
      fill: item.stroke ?? item.fill ?? '#111111',
      strokeWidth: Math.max(1, item.strokeWidthRatio * canvasHeight),
    };
  }
  return {
    ...common,
    type: 'rect',
    width: box.width,
    height: box.height,
    rx: item.cornerRadiusRatio * Math.min(box.width, box.height),
  };
}

function pixelBox(
  box: PosterReconstructionPlan['elements'][number]['box'],
  width: number,
  height: number,
): PixelBox {
  const left = clamp(box.x * width, 0, Math.max(0, width - 1));
  const top = clamp(box.y * height, 0, Math.max(0, height - 1));
  return {
    left,
    top,
    width: Math.max(1, Math.min(box.width * width, width - left)),
    height: Math.max(1, Math.min(box.height * height, height - top)),
  };
}

async function cropReferenceRegion(
  reference: { dataUrl: string; width: number; height: number },
  box: PixelBox,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImage(reference.dataUrl);
  const sourceScaleX = (image.naturalWidth || image.width || reference.width) / reference.width;
  const sourceScaleY = (image.naturalHeight || image.height || reference.height) / reference.height;
  const sx = Math.max(0, Math.round(box.left * sourceScaleX));
  const sy = Math.max(0, Math.round(box.top * sourceScaleY));
  const sw = Math.max(1, Math.round(box.width * sourceScaleX));
  const sh = Math.max(1, Math.round(box.height * sourceScaleY));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not extract an image layer.');
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: canvas.toDataURL('image/webp', 0.9), width: sw, height: sh };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The reference image could not be decoded.'));
    image.src = src;
  });
}

function uniqueId(preferred: string, used: Set<string>): string {
  let value = preferred;
  let suffix = 2;
  while (used.has(value)) value = `${preferred}_${suffix++}`;
  used.add(value);
  return value;
}

function sanitizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'element';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
