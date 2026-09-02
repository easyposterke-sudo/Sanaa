import type { PosterDesignerElementSummary } from '../../../shared/ai/posterDesignerAgent';
import type { PosterReconstructionPlan, ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterImageElement, PosterProject, PosterTextElement } from '../types';
import { inferVisibleTextSemanticRole } from './templateFieldCatalog';

export interface ReferenceFieldAnchor {
  box: ReconstructionElement['box'];
  textAlign: 'left' | 'center' | 'right';
  angle: number;
  opacity: number;
  zIndex: number;
  textStyle?: Pick<
    PosterTextElement,
    | 'fontSize'
    | 'fontFamily'
    | 'fill'
    | 'fillGradient'
    | 'fontWeight'
    | 'fontStyle'
    | 'charSpacing'
    | 'lineHeight'
    | 'stroke'
    | 'strokeWidth'
    | 'fillOpacity'
    | 'shadow'
    | 'textBackground'
  >;
  imageStyle?: Pick<
    PosterImageElement,
    | 'left'
    | 'top'
    | 'scaleX'
    | 'scaleY'
    | 'angle'
    | 'opacity'
    | 'zIndex'
    | 'mask'
    | 'maskCornerRadius'
    | 'maskImageOffsetX'
    | 'maskImageOffsetY'
    | 'maskImageScale'
    | 'maskScale'
    | 'edge'
    | 'edgeFadeDirection'
    | 'edgeFadeAmount'
    | 'edgeFadeMinOpacity'
    | 'flipHorizontal'
    | 'flipVertical'
  >;
}

export function annotateReferencePlan(plan: PosterReconstructionPlan): PosterReconstructionPlan {
  const editableElements = plan.elements.map(recoverMisclassifiedTextArtwork);
  const usedFieldKeys = new Set<string>();
  const themeCandidate = editableElements
    .filter((element) => element.kind === 'text' && element.box.y >= 0.35 && element.box.y <= 0.72)
    .filter((element) => element.box.width >= 0.42 && element.box.height <= 0.12)
    .sort((left, right) => Math.abs((left.box.y + left.box.height / 2) - 0.52) - Math.abs((right.box.y + right.box.height / 2) - 0.52))[0];
  const elements = editableElements.map((element) => {
    if (element.kind === 'text') {
      let role = inferVisibleTextSemanticRole(element.text, element.fontSizeRatio, element.box.height) ?? 'other';
      if (element === themeCandidate && role === 'other') role = 'theme';
      const fieldKey = uniqueReferenceFieldKey(semanticFieldBase(role), usedFieldKeys);
      return {
        ...element,
        suggestedFieldKey: fieldKey,
        suggestedFieldLabel: semanticFieldLabel(role, element.label),
      };
    }
    if (element.kind === 'image_region' && ['person', 'logo'].includes(element.imageRole)) {
      const preferred = element.imageRole === 'person' ? 'person_photo' : 'logo';
      return {
        ...element,
        suggestedFieldKey: uniqueReferenceFieldKey(preferred, usedFieldKeys),
        suggestedFieldLabel: element.imageRole === 'person' ? 'Person photo' : 'Logo',
      };
    }
    return { ...element };
  });
  return { ...plan, elements };
}

export function buildReferenceFieldAnchors(
  plan: PosterReconstructionPlan,
  project?: PosterProject,
  bindings: readonly PosterTemplateFieldBinding[] = [],
): Record<string, ReferenceFieldAnchor> {
  const bindingByKey = new Map(bindings.map((binding) => [binding.key, binding]));
  const elementById = new Map(project?.elements.map((element) => [element.id, element]) ?? []);
  return Object.fromEntries(plan.elements.flatMap((element) => {
    if (!element.suggestedFieldKey) return [];
    const sourceId = bindingByKey.get(element.suggestedFieldKey)?.sourceElementId;
    const compiled = sourceId ? elementById.get(sourceId) : undefined;
    const textStyle = compiled?.type === 'text' ? captureTextStyle(compiled) : undefined;
    const imageStyle = compiled?.type === 'image' ? captureImageStyle(compiled) : undefined;
    return [[element.suggestedFieldKey, {
      box: { ...element.box },
      textAlign: compiled?.type === 'text' ? (compiled.textAlign ?? element.textAlign) : element.textAlign,
      angle: compiled?.angle ?? element.angle,
      opacity: compiled?.opacity ?? element.opacity,
      zIndex: compiled?.zIndex ?? element.zIndex,
      textStyle,
      imageStyle,
    } satisfies ReferenceFieldAnchor]];
  }));
}

export function shouldPrepareReferenceCutout(element: ReconstructionElement): boolean {
  if (element.kind !== 'image_region' || element.imageRole !== 'person' || element.imageMask !== 'none') {
    return false;
  }
  return element.imageCutout
    || /\b(?:cut[ -]?out|isolated|transparent background|background removed|foreground portrait)\b/i.test(
      `${element.label} ${element.replacementReason}`,
    )
    || (element.replacementRecommended && element.imageHasOverlays);
}

export function resolveReferenceCanvasSize(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number; label: string } {
  const width = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1080;
  const height = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1350;
  const scale = Math.min(1, 4096 / Math.max(width, height));
  const resolvedWidth = Math.max(64, Math.round(width * scale));
  const resolvedHeight = Math.max(64, Math.round(height * scale));
  return {
    width: resolvedWidth,
    height: resolvedHeight,
    label: `reference ratio ${resolvedWidth}×${resolvedHeight}`,
  };
}

export function stabilizeReferenceFieldLayout(
  project: PosterProject,
  bindings: readonly PosterTemplateFieldBinding[],
  summaries: readonly PosterDesignerElementSummary[],
  anchors: Readonly<Record<string, ReferenceFieldAnchor>>,
): { project: PosterProject; adjustedElementIds: string[]; skillVersion: string } {
  const elements = project.elements.map((element) => ({ ...element })) as PosterProject['elements'];
  const byId = new Map(elements.map((element) => [element.id, element]));
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const adjusted = new Set<string>();
  for (const binding of bindings) {
    const anchor = anchors[binding.key];
    const element = byId.get(binding.sourceElementId);
    if (!anchor || !element) continue;
    const targetLeft = anchor.box.x * project.canvasWidth;
    const targetTop = anchor.box.y * project.canvasHeight;
    if (element.type === 'text') {
      const fontSizeBeforeRestore = element.fontSize;
      let changed = Math.abs(element.left - targetLeft) > 0.5
        || Math.abs(element.top - targetTop) > 0.5
        || Math.abs((element.width ?? 0) - anchor.box.width * project.canvasWidth) > 0.5
        || element.textAlign !== anchor.textAlign
        || element.angle !== anchor.angle
        || element.opacity !== anchor.opacity
        || element.zIndex !== anchor.zIndex
        || !matchesCapturedTextStyle(element, anchor.textStyle);
      if (anchor.textStyle) restoreTextStyle(element, anchor.textStyle);
      const summary = summaryById.get(element.id);
      if (summary) {
        const restoredScale = element.fontSize / Math.max(1, fontSizeBeforeRestore);
        const fit = Math.min(
          1,
          anchor.box.width / Math.max(0.001, summary.box.width * restoredScale),
          anchor.box.height / Math.max(0.001, summary.box.height * restoredScale),
        );
        if (fit < 0.995) {
          element.fontSize = Math.max(6, element.fontSize * fit * 0.96);
          changed = true;
        }
      }
      element.left = targetLeft;
      element.top = targetTop;
      element.width = Math.max(12, anchor.box.width * project.canvasWidth);
      element.textAlign = anchor.textAlign;
      element.angle = anchor.angle;
      element.opacity = anchor.opacity;
      element.zIndex = anchor.zIndex;
      if (changed) adjusted.add(element.id);
    } else if (element.type === 'image' && anchor.imageStyle) {
      const changed = JSON.stringify(captureImageStyle(element)) !== JSON.stringify(anchor.imageStyle);
      restoreImageStyle(element, anchor.imageStyle);
      if (changed) adjusted.add(element.id);
    } else if (element.type === '3d-text') {
      const changed = Math.abs(element.left - targetLeft) > 0.5 || Math.abs(element.top - targetTop) > 0.5;
      element.left = targetLeft;
      element.top = targetTop;
      if (changed) adjusted.add(element.id);
    }
  }
  for (const summary of summaries.filter((item) => item.agentCreated && !bindings.some((binding) => binding.sourceElementId === item.id))) {
    const element = byId.get(summary.id);
    if (!element || element.locked) continue;
    const safeX = clamp(summary.box.x, 0.04, 0.96 - Math.min(summary.box.width, 0.92));
    const safeY = clamp(summary.box.y, 0.04, 0.96 - Math.min(summary.box.height, 0.92));
    if (Math.abs(safeX - summary.box.x) > 0.001 || Math.abs(safeY - summary.box.y) > 0.001) {
      element.left += (safeX - summary.box.x) * project.canvasWidth;
      element.top += (safeY - summary.box.y) * project.canvasHeight;
      adjusted.add(element.id);
    }
  }
  return {
    project: { ...project, elements },
    adjustedElementIds: [...adjusted],
    skillVersion: 'reference-layout-lock/1.1.0',
  };
}

const TEXT_ARTWORK_DESCRIPTOR = /\b(?:headline|title|typography|lettering|wording|wordmark|type\s*lockup|text\s*artwork)\b/i;
const EVENT_TITLE_WORDING = /\b(?:sunday\s+service|worship\s+service|church\s+service|prayer\s+service|youth\s+service|revival|conference)\b/i;
const TRUE_LOGO_LABEL = /\b(?:church|organization|company|brand|sponsor)\s+(?:logo|mark)\b/i;

function recoverMisclassifiedTextArtwork(element: ReconstructionElement): ReconstructionElement {
  if (element.kind !== 'image_region') return element;
  const label = element.label.trim();
  const eventMatch = label.match(EVENT_TITLE_WORDING)?.[0] ?? '';
  if (TRUE_LOGO_LABEL.test(label) && !eventMatch) return element;
  const wording = safeVisibleWording(element.text)
    || extractQuotedWording(label)
    || eventMatch;
  if (!wording || (!TEXT_ARTWORK_DESCRIPTOR.test(label) && !eventMatch && !element.text.trim())) return element;
  const lowerLabel = label.toLowerCase();
  const script = /script|calligraph|handwrit|cursive/.test(lowerLabel);
  const serif = /serif|editorial/.test(lowerLabel);
  const condensed = /condensed|narrow/.test(lowerLabel);
  return {
    ...element,
    kind: 'text',
    text: wording,
    fill: element.imageDominantColor ?? element.fill ?? '#111111',
    textFillType: 'solid',
    textFillStart: null,
    textFillEnd: null,
    textFillAngle: 0,
    fontFamily: script ? 'great_vibes' : serif ? 'playfair_display' : condensed ? 'oswald' : element.fontFamily,
    fontSizeRatio: Math.max(0.012, Math.min(0.22, element.fontSizeRatio > 0.01 ? element.fontSizeRatio : element.box.height * 0.72)),
    fontWeight: script ? '400' : element.fontWeight === '400' ? '700' : element.fontWeight,
    visibleLineCount: Math.max(1, wording.split(/\r?\n/).length),
    imageRole: 'none',
    imageMask: 'none',
    imageCutout: false,
    imageEdge: 'none',
    imageFadeDirection: 'radial',
    imageFadeAmount: 0.35,
    imageFadeMinOpacity: 0,
    imageHasOverlays: false,
    replacementRecommended: false,
    replacementReason: '',
    imageSearchQuery: '',
    iconName: 'none',
  };
}

function safeVisibleWording(value: string): string {
  const wording = value.trim();
  return wording.length >= 2 && wording.length <= 100 && !/https?:|www\.|[@{}<>]/i.test(wording)
    ? wording
    : '';
}

function extractQuotedWording(label: string): string {
  const match = label.match(/[“"]([^”"]{2,100})[”"]/);
  return safeVisibleWording(match?.[1] ?? '');
}

function captureTextStyle(element: PosterTextElement): NonNullable<ReferenceFieldAnchor['textStyle']> {
  return {
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    fill: element.fill,
    fillGradient: element.fillGradient
      ? { ...element.fillGradient, stops: element.fillGradient.stops.map((stop) => ({ ...stop })) }
      : undefined,
    fontWeight: element.fontWeight,
    fontStyle: element.fontStyle,
    charSpacing: element.charSpacing,
    lineHeight: element.lineHeight,
    stroke: element.stroke,
    strokeWidth: element.strokeWidth,
    fillOpacity: element.fillOpacity,
    shadow: element.shadow ? { ...element.shadow } : undefined,
    textBackground: element.textBackground ? { ...element.textBackground } : undefined,
  };
}

function matchesCapturedTextStyle(
  element: PosterTextElement,
  style: ReferenceFieldAnchor['textStyle'],
): boolean {
  if (!style) return true;
  return element.fontSize === style.fontSize
    && element.fontFamily === style.fontFamily
    && element.fill === style.fill
    && JSON.stringify(element.fillGradient) === JSON.stringify(style.fillGradient)
    && element.fontWeight === style.fontWeight
    && element.fontStyle === style.fontStyle
    && element.charSpacing === style.charSpacing
    && element.lineHeight === style.lineHeight
    && element.stroke === style.stroke
    && element.strokeWidth === style.strokeWidth
    && element.fillOpacity === style.fillOpacity
    && JSON.stringify(element.shadow) === JSON.stringify(style.shadow)
    && JSON.stringify(element.textBackground) === JSON.stringify(style.textBackground);
}

function restoreTextStyle(
  element: PosterTextElement,
  style: NonNullable<ReferenceFieldAnchor['textStyle']>,
): void {
  Object.assign(element, captureTextStyle({ ...element, ...style }));
}

function captureImageStyle(element: PosterImageElement): NonNullable<ReferenceFieldAnchor['imageStyle']> {
  return {
    left: element.left,
    top: element.top,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    angle: element.angle,
    opacity: element.opacity,
    zIndex: element.zIndex,
    mask: element.mask,
    maskCornerRadius: element.maskCornerRadius,
    maskImageOffsetX: element.maskImageOffsetX,
    maskImageOffsetY: element.maskImageOffsetY,
    maskImageScale: element.maskImageScale,
    maskScale: element.maskScale,
    edge: element.edge,
    edgeFadeDirection: element.edgeFadeDirection,
    edgeFadeAmount: element.edgeFadeAmount,
    edgeFadeMinOpacity: element.edgeFadeMinOpacity,
    flipHorizontal: element.flipHorizontal,
    flipVertical: element.flipVertical,
  };
}

function restoreImageStyle(
  element: PosterImageElement,
  style: NonNullable<ReferenceFieldAnchor['imageStyle']>,
): void {
  Object.assign(element, { ...style });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function semanticFieldBase(role: ReturnType<typeof inferVisibleTextSemanticRole> | 'other'): string {
  switch (role) {
    case 'title': return 'event_title';
    case 'organization': return 'organization';
    case 'person_name': return 'person_name';
    case 'theme': return 'theme';
    case 'date': return 'date';
    case 'day': return 'day';
    case 'time': return 'time';
    case 'venue': return 'venue';
    case 'contact': return 'contact';
    case 'phone': return 'phone';
    case 'website': return 'website';
    case 'email': return 'email';
    case 'tagline': return 'tagline';
    case 'extra_details': return 'extra_details';
    default: return 'reference_text';
  }
}

function semanticFieldLabel(
  role: ReturnType<typeof inferVisibleTextSemanticRole> | 'other',
  fallback: string,
): string {
  if (!role || role === 'other') return fallback || 'Reference text';
  return role.split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function uniqueReferenceFieldKey(preferred: string, used: Set<string>): string {
  const base = preferred.replace(/[^a-z0-9_]/g, '_').replace(/^([^a-z])/, 'field_$1').slice(0, 40) || 'field';
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 43)}_${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}
