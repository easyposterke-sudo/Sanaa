import {
  PosterReconstructionPlanSchema,
  type PosterReconstructionPlan,
  type ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import type { PosterTemplateCategory, PosterTemplateFieldBinding } from '../templateTypes';
import type {
  CanvasBackground,
  Poster3DTextElement,
  PosterElement,
  PosterImageElement,
  PosterPathElement,
  PosterPathPoint,
  PosterProject,
  PosterShapeElement,
  PosterTextElement,
} from '../types';
import {
  TWO_LAYER_3D_TEXT_RECIPE_ID,
  compileTwoLayer3DTextState,
  fitTwoLayer3DTextPlacement,
  renderTwoLayer3DTextPreview,
} from './twoLayer3DTextSkill';
import {
  isSocialIconName,
  socialIconSvg,
  type SocialIconName,
} from '../assets/social-icons';

type PixelBox = { left: number; top: number; width: number; height: number };

export interface CompiledPosterReconstruction {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
  suggestedTemplateName: string;
  category: PosterTemplateCategory;
  description: string;
  warnings: string[];
}

export interface ReconstructionImageReplacement {
  src: string;
  width: number;
  height: number;
  credit?: string;
}

const FONT_STACKS: Record<PosterReconstructionPlan['elements'][number]['fontFamily'], string> = {
  arial: 'Arial, Helvetica, sans-serif',
  arial_black: 'Arial Black, sans-serif',
  allura: '"Allura", cursive',
  anton: '"Anton", sans-serif',
  bebas_neue: '"Bebas Neue", sans-serif',
  chewy: '"Chewy", cursive',
  courier_new: 'Courier New, Courier, monospace',
  crimson_pro: '"Crimson Pro", Georgia, serif',
  dancing_script: '"Dancing Script", cursive',
  fredoka: '"Fredoka", sans-serif',
  georgia: 'Georgia, serif',
  great_vibes: '"Great Vibes", cursive',
  impact: 'Impact, sans-serif',
  inter: '"Inter", sans-serif',
  lato: '"Lato", Arial, sans-serif',
  lilita_one: '"Lilita One", sans-serif',
  luckiest_guy: '"Luckiest Guy", cursive',
  merriweather: '"Merriweather", Georgia, serif',
  modak: '"Modak", cursive',
  montserrat: '"Montserrat", sans-serif',
  nunito: '"Nunito", Arial, sans-serif',
  open_sans: '"Open Sans", sans-serif',
  oswald: '"Oswald", sans-serif',
  pacifico: '"Pacifico", cursive',
  playfair_display: '"Playfair Display", serif',
  poppins: '"Poppins", sans-serif',
  raleway: '"Raleway", Arial, sans-serif',
  roboto: '"Roboto", sans-serif',
  sacramento: '"Sacramento", cursive',
  satisfy: '"Satisfy", cursive',
  source_sans_3: '"Source Sans 3", Arial, sans-serif',
  tangerine: '"Tangerine", cursive',
  times_new_roman: 'Times New Roman, serif',
  trebuchet_ms: '"Trebuchet MS", sans-serif',
  verdana: 'Verdana, sans-serif',
};

export async function compilePosterReconstruction(input: {
  plan: PosterReconstructionPlan;
  reference: { dataUrl: string; width: number; height: number };
  canvasSize?: { width: number; height: number };
  referenceGuideOpacity?: number;
  imageReplacements?: Readonly<Record<string, ReconstructionImageReplacement>>;
}): Promise<CompiledPosterReconstruction> {
  const plan = PosterReconstructionPlanSchema.parse(input.plan);
  const canvasWidth = normalizeCanvasDimension(input.canvasSize?.width, input.reference.width);
  const canvasHeight = normalizeCanvasDimension(input.canvasSize?.height, input.reference.height);
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
      scaleX: canvasWidth / Math.max(1, input.reference.width),
      scaleY: canvasHeight / Math.max(1, input.reference.height),
      angle: 0,
      opacity: guideOpacity,
      zIndex: nextZ++,
      locked: true,
      excludeFromExport: true,
      mask: 'none',
      edge: 'none',
    });
    warnings.unshift('A locked reference guide is behind the reconstructed layers. Replace or delete it before publishing the template.');
  }

  const ordered = [...plan.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const item of ordered) {
    const box = pixelBox(
      item.box,
      canvasWidth,
      canvasHeight,
      isNativeShapeKind(item.kind),
    );
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

    const repairedBadgeWording = item.kind === 'image_region'
      ? extractMisclassifiedBadgeWording(item)
      : null;
    const repairedBadge = repairedBadgeWording
      ? compileMisclassifiedTextBadge({
          item,
          box,
          canvasHeight,
          shapeId: uniqueId(`${id}_background`, usedIds),
          wording: repairedBadgeWording,
          textBase: base,
          textZIndex: nextZ,
        })
      : null;
    if (repairedBadge) {
      nextZ += 1;
      elements.push(repairedBadge.shape, repairedBadge.text);
      const fieldKey = item.suggestedFieldKey;
      if (fieldKey && item.suggestedFieldLabel.trim() && !usedFieldKeys.has(fieldKey)) {
        usedFieldKeys.add(fieldKey);
        fields.push({
          key: fieldKey,
          label: item.suggestedFieldLabel.trim(),
          sourceElementId: id,
          kind: 'text',
        });
      }
      warnings.push(`“${item.label}” was rebuilt as an editable shape and text instead of an image placeholder.`);
      if (item.confidence < 0.55) {
        warnings.push(`Review “${item.label}”; the AI reported low confidence.`);
      }
      continue;
    }

    let element: PosterElement;
    if (item.kind === 'text') {
      const displayText = (item.text || item.label).trim();
      if (item.textEffect === 'two_layer_3d' && displayText.length <= 80) {
        element = compileThreeDTextElement(item, box, base);
      } else {
        element = compileTextElement(item, box, canvasHeight, base);
        if (item.textEffect === 'two_layer_3d') {
          warnings.push(`“${item.label}” was kept flat because the two-layer 3D preset accepts at most 80 characters per block.`);
        }
      }
    } else if (item.kind === 'image_region') {
      const replacement = input.imageReplacements?.[item.key];
      const image = await compileImageRegion({
        item,
        box,
        reference: input.reference,
        replacement,
        warnings,
      });
      element = {
        ...base,
        ...(image.layout ?? {
          left: box.left,
          top: box.top,
          scaleX: box.width / image.width,
          scaleY: box.height / image.height,
        }),
        layerName: image.layerName ?? base.layerName,
        type: 'image',
        src: image.dataUrl,
        ...(item.imageRole === 'background_photo'
          ? {
              assetRole: 'background' as const,
              backgroundLibraryLabel: item.label,
            }
          : {}),
        mask: reconstructionImageMask(item.imageMask),
        ...(item.imageMask === 'rounded_rect'
          ? { maskCornerRadius: resolvedMaskCornerRadius(item.cornerStyle, item.cornerRadiusRatio) }
          : {}),
        edge: 'none',
      } satisfies PosterImageElement;
    } else if (item.kind === 'path') {
      element = compilePathElement(item, box, canvasHeight, base, warnings);
    } else {
      element = compileShapeElement(item, box, canvasHeight, base);
    }
    elements.push(element);

    const fieldKey = item.suggestedFieldKey;
    if (
      fieldKey &&
      item.suggestedFieldLabel.trim() &&
      (element.type === 'text' || element.type === '3d-text' || element.type === 'image') &&
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

function normalizeCanvasDimension(value: number | undefined, fallback: number): number {
  const candidate = Number.isFinite(value) ? Math.round(value as number) : Math.round(fallback);
  return Math.max(64, Math.min(4096, candidate));
}

function compilePathElement(
  item: ReconstructionElement,
  box: PixelBox,
  canvasHeight: number,
  base: Pick<
    PosterPathElement,
    'id' | 'layerName' | 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'zIndex'
  >,
  warnings: string[],
): PosterPathElement {
  const minimumPoints = item.pathClosed ? 3 : 2;
  const sourcePoints = item.pathPoints.length >= minimumPoints
    ? item.pathPoints
    : [
        { x: 0, y: 0, smooth: false },
        { x: 1, y: 0, smooth: false },
        { x: 1, y: 1, smooth: false },
        { x: 0, y: 1, smooth: false },
      ];
  if (item.pathPoints.length < minimumPoints) {
    warnings.push(`“${item.label}” did not contain enough path anchors, so a rectangular path was used.`);
  }

  const strokeWidth = item.stroke ? item.strokeWidthRatio * canvasHeight : 0;
  const inset = Math.min(strokeWidth / 2, box.width * 0.24, box.height * 0.24);
  const anchors = sourcePoints.map((point) => ({
    x: clamp(point.x * box.width, inset, Math.max(inset, box.width - inset)),
    y: clamp(point.y * box.height, inset, Math.max(inset, box.height - inset)),
    smooth: point.smooth,
  }));
  const pathPoints: PosterPathPoint[] = anchors.map((anchor, index) => {
    if (!anchor.smooth) return { x: anchor.x, y: anchor.y };
    const previous = anchors[index - 1] ?? (item.pathClosed ? anchors.at(-1) : undefined);
    const next = anchors[index + 1] ?? (item.pathClosed ? anchors[0] : undefined);
    if (!previous || !next) return { x: anchor.x, y: anchor.y };
    const directionX = next.x - previous.x;
    const directionY = next.y - previous.y;
    const directionLength = Math.hypot(directionX, directionY);
    if (directionLength < 0.001) return { x: anchor.x, y: anchor.y };
    const incomingDistance = Math.hypot(anchor.x - previous.x, anchor.y - previous.y);
    const outgoingDistance = Math.hypot(next.x - anchor.x, next.y - anchor.y);
    const handleLength = Math.min(incomingDistance, outgoingDistance) * item.pathTension;
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    return {
      x: anchor.x,
      y: anchor.y,
      inX: anchor.x - unitX * handleLength,
      inY: anchor.y - unitY * handleLength,
      outX: anchor.x + unitX * handleLength,
      outY: anchor.y + unitY * handleLength,
    };
  });

  return {
    ...base,
    layerName: `AI path: ${item.label}`,
    type: 'path',
    fill: item.fill ?? 'transparent',
    stroke: item.stroke ?? undefined,
    strokeWidth,
    pathPoints,
    closed: item.pathClosed,
    fillRule: 'nonzero',
  };
}

async function compileImageRegion(input: {
  item: ReconstructionElement;
  box: PixelBox;
  reference: { dataUrl: string; width: number; height: number };
  replacement?: ReconstructionImageReplacement;
  warnings: string[];
}): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  layerName?: string;
  layout?: Pick<PosterImageElement, 'left' | 'top' | 'scaleX' | 'scaleY'>;
}> {
  const { item, box, replacement, warnings } = input;
  if (item.imageRole === 'icon' && item.iconName !== 'none') {
    return {
      dataUrl: builtInIconDataUrl(item.iconName, item.imageDominantColor ?? item.fill ?? '#111111'),
      width: 100,
      height: 100,
      layerName: `AI icon: ${item.label}`,
    };
  }

  if (replacement) {
    if (item.imageRole === 'person' && item.imageMask === 'none') {
      if (replacement.credit?.trim()) {
        warnings.push(`Replacement for “${item.label}”: ${replacement.credit.trim()}.`);
      }
      return {
        dataUrl: replacement.src,
        width: Math.max(1, replacement.width),
        height: Math.max(1, replacement.height),
        layerName: `AI replacement: ${item.label}`,
        layout: fitPersonReplacementIntoBox(replacement, box),
      };
    }
    const crop = await cropImageToAspect(replacement, box.width / box.height);
    if (replacement.credit?.trim()) {
      warnings.push(`Replacement for “${item.label}”: ${replacement.credit.trim()}.`);
    }
    return {
      dataUrl: crop.dataUrl,
      width: crop.width,
      height: crop.height,
      layerName: `AI replacement: ${item.label}`,
    };
  }

  if (item.replacementRecommended) {
    const role = item.imageRole === 'person' ? 'person' : 'photo';
    const reason = item.replacementReason.trim() || 'the source area contains overlapping poster artwork';
    warnings.push(`“${item.label}” uses a clean ${role} placeholder because ${reason}. Replace it with an original, uploaded, or stock image.`);
    return {
      dataUrl: imagePlaceholderDataUrl({
        role,
        label: item.label,
        color: item.imageDominantColor ?? '#64748b',
      }),
      width: 400,
      height: 400,
      layerName: `REPLACE IMAGE: ${item.label}`,
    };
  }

  return cropReferenceRegion(input.reference, box);
}

function reconstructionImageMask(
  mask: ReconstructionElement['imageMask'],
): PosterImageElement['mask'] {
  return mask === 'rounded_rect' ? 'rounded-rect' : mask;
}

function resolvedMaskCornerRadius(
  style: ReconstructionElement['cornerStyle'],
  detectedRatio: number,
): number {
  if (style === 'sharp') return 0;
  if (detectedRatio > 0) return clamp(detectedRatio, 0, 0.5);
  if (style === 'pill') return 0.5;
  if (style === 'rounded') return 0.18;
  if (style === 'subtle') return 0.08;
  return 0.18;
}

/**
 * Foreground people are cutouts, not photo frames. Keep the full replacement visible,
 * center it horizontally, and anchor it to the bottom of the detected portrait region.
 */
export function fitPersonReplacementIntoBox(
  source: Pick<ReconstructionImageReplacement, 'width' | 'height'>,
  box: PixelBox,
): Pick<PosterImageElement, 'left' | 'top' | 'scaleX' | 'scaleY'> {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  return {
    left: box.left + (box.width - renderedWidth) / 2,
    top: box.top + box.height - renderedHeight,
    scaleX: scale,
    scaleY: scale,
  };
}

function compileThreeDTextElement(
  item: ReconstructionElement,
  box: PixelBox,
  base: Pick<Poster3DTextElement, 'id' | 'layerName' | 'zIndex'>,
): Poster3DTextElement {
  const text = (item.text || item.label).trim();
  const fontFamily = FONT_STACKS[item.fontFamily];
  const state = compileTwoLayer3DTextState({
    recipeId: TWO_LAYER_3D_TEXT_RECIPE_ID,
    text,
    fontFamily,
    fontSize: 120,
    fontWeight: item.fontWeight,
    letterSpacing: clamp((item.charSpacing / 1000) * 120, -20, 48),
    faceColor: item.fill ?? '#ffffff',
    extrusionColor: item.extrusionColor ?? item.stroke ?? '#000000',
    environmentId: 'golden',
  });
  const svg = renderTwoLayer3DTextPreview(state);
  const preview = readSvgSize(svg);
  const placement = fitTwoLayer3DTextPlacement({
    sourceWidth: preview.width,
    sourceHeight: preview.height,
    box,
    fit: 'contain',
    angle: item.angle,
    opacity: item.opacity,
  });

  return {
    ...base,
    type: '3d-text',
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    config: state,
    previewWidth: preview.width,
    previewHeight: preview.height,
    ...placement,
    shadow: { color: '#00000066', blur: 3, offsetX: 4, offsetY: 5 },
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
  const displayText = item.text || item.label;
  const lines = displayText.split(/\r?\n/);
  const lineCount = Math.max(1, lines.length);
  const measuredSize = item.fontSizeRatio * canvasHeight;
  // Fabric applies lineHeight between baselines rather than independently to
  // every row. Include those extra line gaps when enforcing the detected
  // source box, otherwise multi-line copy grows beyond its reference bounds.
  const verticalLineUnits = 1 + Math.max(0, lineCount - 1) * item.lineHeight;
  const boxLimitedSize = (box.height / verticalLineUnits) * 0.94;
  const initialFontSize = Math.max(6, Math.min(measuredSize, Math.max(8, boxLimitedSize)));
  const fontFamily = FONT_STACKS[item.fontFamily];
  const fontSize = item.visibleLineCount > 0 && item.visibleLineCount === lineCount
    ? fitDetectedTextFontSize({
        lines,
        fontFamily,
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle,
        charSpacing: item.charSpacing,
        initialFontSize,
        availableWidth: Math.max(12, box.width),
      })
    : initialFontSize;
  return {
    ...base,
    type: 'text',
    text: displayText,
    fontSize,
    fontFamily,
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

export function fitDetectedTextFontSize(input: {
  lines: string[];
  fontFamily: string;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  charSpacing: number;
  initialFontSize: number;
  availableWidth: number;
}): number {
  const initial = Math.max(6, input.initialFontSize);
  const widthLimit = Math.max(12, input.availableWidth) * 0.98;
  const widest = Math.max(
    1,
    ...input.lines.map((line) => measuredTextLineWidth({ ...input, line, fontSize: initial })),
  );
  if (widest <= widthLimit) return initial;
  return Math.max(6, initial * (widthLimit / widest));
}

function measuredTextLineWidth(input: {
  line: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  charSpacing: number;
  fontSize: number;
}): number {
  const glyphs = Array.from(input.line);
  const spacing = Math.max(0, glyphs.length - 1) * input.fontSize * (input.charSpacing / 1000);
  try {
    if (typeof document !== 'undefined') {
      const context = document.createElement('canvas').getContext('2d');
      if (context) {
        context.font = `${input.fontStyle} ${input.fontWeight} ${input.fontSize}px ${input.fontFamily}`;
        const measured = context.measureText(input.line).width;
        if (Number.isFinite(measured) && measured > 0) return measured + spacing;
      }
    }
  } catch {
    // Browser/test environments without Canvas 2D use the deterministic estimate below.
  }
  const lowerFamily = input.fontFamily.toLowerCase();
  const widthFactor = /(?:bebas|oswald|anton)/.test(lowerFamily)
    ? 0.54
    : /(?:allura|dancing|great vibes|sacramento|satisfy|tangerine)/.test(lowerFamily)
      ? 0.56
      : /(?:arial black|impact|luckiest|lilita|modak)/.test(lowerFamily)
        ? 0.66
        : 0.6;
  return glyphs.length * input.fontSize * widthFactor + spacing;
}

const TEXT_BADGE_SUFFIX = /\s+(?:badge|button|callout)$/i;
const GENERIC_BADGE_LABEL = /\b(?:badge|button|callout|decorative|decoration|graphic|artwork|illustration|image|photo|logo|icon|round|rounded|circular|rectangle|rectangular)\b/i;

function extractMisclassifiedBadgeWording(item: ReconstructionElement): string | null {
  if (
    item.imageRole !== 'decoration' ||
    !item.replacementRecommended ||
    !item.imageHasOverlays ||
    !TEXT_BADGE_SUFFIX.test(item.label)
  ) {
    return null;
  }
  const wording = item.text.trim() || item.label.replace(TEXT_BADGE_SUFFIX, '').trim();
  if (
    wording.length < 2 ||
    wording.length > 60 ||
    GENERIC_BADGE_LABEL.test(wording) ||
    /https?:|www\.|[@{}<>]/i.test(wording)
  ) {
    return null;
  }
  return wording;
}

function compileMisclassifiedTextBadge(input: {
  item: ReconstructionElement;
  box: PixelBox;
  canvasHeight: number;
  shapeId: string;
  wording: string;
  textBase: Pick<PosterTextElement, 'id' | 'layerName' | 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'zIndex'>;
  textZIndex: number;
}): { shape: PosterShapeElement; text: PosterTextElement } {
  const { item, box, canvasHeight, shapeId, wording, textBase, textZIndex } = input;

  const aspect = box.width / box.height;
  const isCircular = aspect >= 0.75 && aspect <= 1.25;
  const fill = item.imageDominantColor ?? item.fill ?? '#64748b';
  const shapeBase = {
    id: shapeId,
    layerName: `AI badge background: ${wording}`,
    left: box.left,
    top: box.top,
    scaleX: 1,
    scaleY: 1,
    angle: item.angle,
    opacity: item.opacity,
    zIndex: textBase.zIndex,
    fill,
    stroke: item.stroke ?? undefined,
    strokeWidth: item.stroke ? item.strokeWidthRatio * canvasHeight : 0,
  };
  const shape: PosterShapeElement = isCircular
    ? {
        ...shapeBase,
        type: 'circle',
        radius: box.width / 2,
        scaleY: box.height / box.width,
      }
    : {
        ...shapeBase,
        type: 'rect',
        width: box.width,
        height: box.height,
        rx: item.cornerStyle === 'auto' && item.cornerRadiusRatio <= 0
          ? Math.min(box.width, box.height) * 0.18
          : resolvedDetectedCornerRadius(item.cornerStyle, item.cornerRadiusRatio, box),
      };

  const text = isCircular ? splitBadgeText(wording) : wording;
  const lines = text.split('\n');
  const horizontalPadding = box.width * (isCircular ? 0.15 : 0.08);
  const textWidth = Math.max(12, box.width - horizontalPadding * 2);
  const longestLine = Math.max(...lines.map((line) => line.length), 1);
  const fontSize = Math.max(6, Math.min(
    box.height / (lines.length * 1.3),
    textWidth / (longestLine * 0.58),
  ));
  const estimatedTextHeight = fontSize * lines.length * 1.05;
  const textColor = contrastingTextColor(fill);
  const textElement: PosterTextElement = {
    ...textBase,
    layerName: `AI badge text: ${wording}`,
    left: box.left + horizontalPadding,
    top: box.top + (box.height - estimatedTextHeight) / 2,
    zIndex: textZIndex,
    type: 'text',
    text,
    fontSize,
    fontFamily: FONT_STACKS[item.fontFamily],
    fill: textColor,
    width: textWidth,
    fontWeight: item.fontWeight === '400' ? '700' : item.fontWeight,
    fontStyle: item.fontStyle,
    charSpacing: item.charSpacing,
    lineHeight: 1.05,
    textAlign: 'center',
    stroke: undefined,
    strokeWidth: 0,
  };

  return { shape, text: textElement };
}

function splitBadgeText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return text;
  let splitAt = 1;
  let bestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const leftLength = words.slice(0, index).join(' ').length;
    const rightLength = words.slice(index).join(' ').length;
    const difference = Math.abs(leftLength - rightLength);
    if (difference < bestDifference) {
      bestDifference = difference;
      splitAt = index;
    }
  }
  return `${words.slice(0, splitAt).join(' ')}\n${words.slice(splitAt).join(' ')}`;
}

function contrastingTextColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return '#ffffff';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  const perceivedBrightness = (red * 299 + green * 587 + blue * 114) / 255000;
  return perceivedBrightness > 0.62 ? '#111111' : '#ffffff';
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
    // A circle must remain circular even when the model's two detected
    // dimensions differ slightly. Ellipses have their own explicit kind.
    const diameter = Math.max(1, (box.width + box.height) / 2);
    return {
      ...common,
      left: box.left + (box.width - diameter) / 2,
      top: box.top + (box.height - diameter) / 2,
      type: 'circle',
      radius: diameter / 2,
      scaleY: 1,
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
    const geometry = resolvedLineGeometry(item.angle, box);
    return {
      ...common,
      ...geometry,
      type: 'line',
      fill: item.stroke ?? item.fill ?? '#111111',
      strokeWidth: Math.max(1, item.strokeWidthRatio * canvasHeight),
    };
  }
  if (item.kind === 'triangle') {
    return {
      ...common,
      type: 'triangle',
      width: box.width,
      height: box.height,
    };
  }
  if (item.kind === 'star') {
    return {
      ...common,
      type: 'polygon',
      polygonPoints: regularStarPoints(box.width, box.height),
    };
  }
  return {
    ...common,
    type: 'rect',
    width: box.width,
    height: box.height,
    rx: resolvedDetectedCornerRadius(item.cornerStyle, item.cornerRadiusRatio, box),
  };
}

/**
 * Preserve the AI's sharp-vs-rounded decision while compensating slightly for
 * understated detected radii. This is deliberately local to rect geometry: it
 * cannot affect text metrics, element boxes, fonts, z-order, or path anchors.
 */
export function amplifiedDetectedCornerRadius(
  detectedRatio: number,
  box: Pick<PixelBox, 'width' | 'height'>,
): number {
  if (detectedRatio <= 0) return 0;
  const adjustedRatio = Math.min(0.5, detectedRatio * 1.4);
  return adjustedRatio * Math.min(box.width, box.height);
}

/**
 * Turn an explicit visual corner class into a stable radius. Old plans use
 * `auto`, which retains the previous numeric-radius behavior exactly.
 */
export function resolvedDetectedCornerRadius(
  style: ReconstructionElement['cornerStyle'],
  detectedRatio: number,
  box: Pick<PixelBox, 'width' | 'height'>,
): number {
  if (style === 'auto') return amplifiedDetectedCornerRadius(detectedRatio, box);
  if (style === 'sharp') return 0;
  const minimumRatio = style === 'pill' ? 0.42 : style === 'rounded' ? 0.16 : 0.06;
  const adjustedRatio = Math.min(0.5, Math.max(minimumRatio, detectedRatio * 1.4));
  return adjustedRatio * Math.min(box.width, box.height);
}

function pixelBox(
  box: PosterReconstructionPlan['elements'][number]['box'],
  width: number,
  height: number,
  allowCanvasOverflow = false,
): PixelBox {
  if (allowCanvasOverflow) {
    return {
      left: box.x * width,
      top: box.y * height,
      width: Math.max(1, box.width * width),
      height: Math.max(1, box.height * height),
    };
  }
  const left = clamp(box.x * width, 0, Math.max(0, width - 1));
  const top = clamp(box.y * height, 0, Math.max(0, height - 1));
  return {
    left,
    top,
    width: Math.max(1, Math.min(box.width * width, width - left)),
    height: Math.max(1, Math.min(box.height * height, height - top)),
  };
}

function isNativeShapeKind(kind: ReconstructionElement['kind']): boolean {
  return kind === 'rect' || kind === 'circle' || kind === 'ellipse' ||
    kind === 'triangle' || kind === 'star' || kind === 'line';
}

function regularStarPoints(width: number, height: number): { x: number; y: number }[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const outerX = width / 2;
  const outerY = height / 2;
  const innerScale = 0.4;
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const scale = index % 2 === 0 ? 1 : innerScale;
    return {
      x: centerX + Math.cos(angle) * outerX * scale,
      y: centerY + Math.sin(angle) * outerY * scale,
    };
  });
}

function resolvedLineGeometry(
  detectedAngle: number,
  box: PixelBox,
): Pick<PosterShapeElement, 'left' | 'top' | 'angle' | 'x1' | 'y1' | 'x2' | 'y2'> {
  const undirectedAngle = ((detectedAngle + 90) % 180 + 180) % 180 - 90;
  const boxLooksVertical = box.height >= box.width * 1.35;
  const boxLooksHorizontal = box.width >= box.height * 1.35;
  const angleLooksVertical = Math.abs(undirectedAngle) >= 75;
  const angleLooksHorizontal = Math.abs(undirectedAngle) <= 15;

  if (boxLooksVertical || (!boxLooksHorizontal && angleLooksVertical)) {
    return {
      left: box.left + box.width / 2,
      top: box.top,
      angle: 0,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: box.height,
    };
  }

  if (boxLooksHorizontal || angleLooksHorizontal) {
    return {
      left: box.left,
      top: box.top + box.height / 2,
      angle: 0,
      x1: 0,
      y1: 0,
      x2: box.width,
      y2: 0,
    };
  }

  // Diagonal lines use their detected bounding-box corners directly. Encoding
  // orientation in endpoints avoids short rotated segments and keeps the line
  // editable with the same native line controls as axis-aligned separators.
  const risesToRight = undirectedAngle < 0;
  return {
    left: box.left,
    top: box.top,
    angle: 0,
    x1: 0,
    y1: risesToRight ? box.height : 0,
    x2: box.width,
    y2: risesToRight ? 0 : box.height,
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

async function cropImageToAspect(
  source: { src: string; width: number; height: number },
  targetAspect: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImage(source.src);
  const naturalWidth = Math.max(1, image.naturalWidth || image.width || source.width);
  const naturalHeight = Math.max(1, image.naturalHeight || image.height || source.height);
  const sourceAspect = naturalWidth / naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = naturalWidth;
  let sh = naturalHeight;
  if (sourceAspect > targetAspect) {
    sw = Math.max(1, Math.round(naturalHeight * targetAspect));
    sx = Math.round((naturalWidth - sw) / 2);
  } else if (sourceAspect < targetAspect) {
    sh = Math.max(1, Math.round(naturalWidth / targetAspect));
    sy = Math.round((naturalHeight - sh) / 2);
  }
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the replacement image.');
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: canvas.toDataURL('image/webp', 0.9), width: sw, height: sh };
}

function imagePlaceholderDataUrl(input: {
  role: 'person' | 'photo';
  label: string;
  color: string;
}): string {
  const label = escapeXml(input.label.slice(0, 42));
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#64748b';
  const artwork = input.role === 'person'
    ? `<circle cx="200" cy="145" r="62" fill="#ffffff" fill-opacity=".9"/><path d="M88 360c10-91 54-137 112-137s102 46 112 137" fill="#ffffff" fill-opacity=".9"/>`
    : `<path d="M54 305l82-91 57 56 50-43 103 104H54z" fill="#ffffff" fill-opacity=".82"/><circle cx="291" cy="116" r="35" fill="#ffffff" fill-opacity=".82"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="24" fill="${color}"/>${artwork}<rect y="344" width="400" height="56" fill="#000000" fill-opacity=".42"/><text x="200" y="378" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#ffffff">REPLACE: ${label}</text></svg>`;
  return svgDataUrl(svg);
}

function builtInIconDataUrl(
  icon: Exclude<ReconstructionElement['iconName'], 'none'>,
  requestedColor: string,
): string {
  const color = /^#[0-9a-f]{6}$/i.test(requestedColor) ? requestedColor : '#111111';
  if (isSocialIconName(icon)) return svgDataUrl(socialIconSvg(icon, color));

  const paths: Record<Exclude<typeof icon, SocialIconName>, string> = {
    calendar: '<rect x="17" y="22" width="66" height="61" rx="8"/><path d="M17 39h66M34 13v18M66 13v18M32 53h8M47 53h8M62 53h8M32 68h8M47 68h8M62 68h8"/>',
    clock: '<circle cx="50" cy="50" r="36"/><path d="M50 29v23l17 11"/>',
    location: '<path d="M50 89S22 62 22 39a28 28 0 1 1 56 0c0 23-28 50-28 50z"/><circle cx="50" cy="39" r="9"/>',
    phone: '<path d="M29 15l15 18-10 11c8 16 16 24 32 32l11-10 18 15-7 12c-4 7-13 9-21 6C36 88 12 64 1 33-2 25 0 16 7 12l12-7z" transform="translate(3 -1) scale(.92)"/>',
    web: '<circle cx="50" cy="50" r="37"/><path d="M13 50h74M50 13c13 12 19 24 19 37S63 75 50 87M50 13C37 25 31 37 31 50s6 25 19 37"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</g></svg>`;
  return svgDataUrl(svg);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The reference image could not be decoded.'));
    image.src = src;
  });
}

function readSvgSize(svg: string): { width: number; height: number } {
  const width = Number(svg.match(/<svg[^>]*\bwidth="([0-9.]+)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\bheight="([0-9.]+)"/)?.[1]);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('The generated two-layer 3D preview has invalid dimensions.');
  }
  return { width, height };
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
