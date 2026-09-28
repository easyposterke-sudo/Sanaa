import { z } from 'zod';
import {
  MAX_REFERENCE_ELEMENTS, POSTER_RECONSTRUCTION_JSON_SCHEMA, PosterReconstructionPlanSchema,
  ReconstructionElementSchema, type PosterReconstructionPlan, type ReconstructionElement,
} from './posterReconstruction';
import { ReferenceGradientSchema, referenceFidelityJsonSchema } from './referenceFidelity';

type Schema = Record<string, unknown>;
const baseProperties: Record<string, Schema> = POSTER_RECONSTRUCTION_JSON_SCHEMA.properties.elements.items.properties;
const common = ['key', 'kind', 'label', 'box', 'angle', 'opacity', 'zIndex', 'confidence', 'suggestedFieldKey', 'suggestedFieldLabel'];
const paint = ['fill', 'stroke', 'strokeWidthRatio', 'textFillType', 'textFillStart', 'textFillEnd', 'textFillAngle', 'fillStartOpacity', 'fillEndOpacity'];
const text = ['text', 'fontFamily', 'fontCatalogId', 'fontSizeRatio', 'fontWeight', 'fontStyle', 'textAlign', 'charSpacing', 'textWidthMode', 'lineHeight', 'visibleLineCount', 'textCurve', 'textEffect', 'textHasVisibleExtrusion', 'textExtrusionDepthRatio', 'extrusionColor'];
const shape = ['cornerRadiusRatio', 'cornerStyle'];
const path = ['pathPoints', 'pathUsage', 'pathClosed', 'pathTension'];
const raster = Object.keys(baseProperties).filter(key => key.startsWith('image') || key.startsWith('replacement') || key === 'iconName');

function variant(kinds: string[], keys: string[]): Schema {
  const properties: Record<string, Schema> = Object.fromEntries([...common, ...keys].map(key => [key, baseProperties[key]!]));
  properties.kind = { type: 'string', enum: kinds };
  // Raster/3D behavior remains governed by the existing pipeline.
  properties.fidelity = { anyOf: [referenceFidelityJsonSchema(), { type: 'null' }] };
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
}

export const REFERENCE_ELEMENT_JSON_SCHEMA = { anyOf: [
  variant(['text'], [...paint, ...text]),
  variant(['rect', 'circle', 'ellipse', 'triangle', 'star', 'line'], [...paint, ...shape]),
  variant(['path'], [...paint, ...path]),
  variant(['image_region'], [...paint, ...shape, ...raster]),
] };
const { $schema: _schema, ...gradient } = z.toJSONSchema(ReferenceGradientSchema);
const canvas = POSTER_RECONSTRUCTION_JSON_SCHEMA.properties.canvas;
export const REFERENCE_CANVAS_JSON_SCHEMA = {
  ...canvas,
  required: [...canvas.required, 'gradient'],
  properties: { ...canvas.properties, gradient: { anyOf: [gradient, { type: 'null' }] } },
};
export const POSTER_REFERENCE_JSON_SCHEMA = {
  ...POSTER_RECONSTRUCTION_JSON_SCHEMA,
  properties: {
    ...POSTER_RECONSTRUCTION_JSON_SCHEMA.properties,
    canvas: REFERENCE_CANVAS_JSON_SCHEMA,
    elements: { type: 'array', maxItems: MAX_REFERENCE_ELEMENTS, items: REFERENCE_ELEMENT_JSON_SCHEMA },
  },
};

// Only irrelevant properties receive defaults. Missing type-specific measurements fail validation.
const neutral = {
  fill: null, stroke: null, strokeWidthRatio: 0, text: '', fontFamily: 'arial', fontSizeRatio: 0.04,
  fontWeight: '400', fontStyle: 'normal', textAlign: 'left', charSpacing: 0, lineHeight: 1.16,
  textEffect: 'flat', extrusionColor: null, cornerRadiusRatio: 0, pathPoints: [],
  pathClosed: false, pathTension: 0.28, imageRole: 'none', imageHasOverlays: false,
  replacementRecommended: false, replacementReason: '', imageSearchQuery: '',
  imageDominantColor: null, iconName: 'none', suggestedFieldKey: null, suggestedFieldLabel: '',
};

export function expandReferenceElement(value: unknown): ReconstructionElement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reference layer.');
  const item = value as Record<string, unknown>;
  const required = item.kind === 'text' ? ['text', 'fontFamily', 'fontSizeRatio']
    : item.kind === 'path' ? ['pathPoints', 'pathClosed']
    : item.kind === 'image_region' ? ['imageRole'] : ['fill'];
  for (const key of [...common.slice(0, 8), ...required]) {
    if (!(key in item)) throw new Error(`Reference layer is missing ${key}.`);
  }
  return ReconstructionElementSchema.parse({ ...neutral, ...item });
}

export function expandReferencePlan(value: unknown): PosterReconstructionPlan {
  if (!value || typeof value !== 'object') throw new Error('Invalid reference plan.');
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.elements)) throw new Error('Invalid reference layers.');
  const result = PosterReconstructionPlanSchema.parse({ ...plan, elements: plan.elements.map(expandReferenceElement) });
  if (new Set(result.elements.map(item => item.key)).size !== result.elements.length) throw new Error('Duplicate reference layer keys.');
  return result;
}

export const POSTER_REFERENCE_PATCH_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'upsert', 'canvas'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    upsert: { type: 'array', maxItems: 40, items: REFERENCE_ELEMENT_JSON_SCHEMA },
    canvas: { anyOf: [REFERENCE_CANVAS_JSON_SCHEMA, { type: 'null' }] },
  },
};

export function isProtectedReferenceElement(item: ReconstructionElement): boolean {
  return item.kind === 'image_region' || item.textEffect === 'two_layer_3d';
}

/** Review can add or refine vector content, but cannot replace images, 3D, or verified wording. */
export function applyReferenceReview(previous: PosterReconstructionPlan, value: unknown): PosterReconstructionPlan {
  const patch = z.object({ summary: z.string().min(1).max(500), upsert: z.array(z.unknown()).max(40), canvas: PosterReconstructionPlanSchema.shape.canvas.nullable() }).strict().parse(value);
  const updates = patch.upsert.map(expandReferenceElement);
  if (new Set(updates.map(item => item.key)).size !== updates.length) throw new Error('Duplicate corrections.');
  const existing = new Map(previous.elements.map(item => [item.key, item]));
  for (const item of updates) {
    const old = existing.get(item.key);
    if (isProtectedReferenceElement(item) || (old && isProtectedReferenceElement(old))) throw new Error('Images and 3D layers are protected.');
    if (old?.kind === 'text' && (item.kind !== 'text' || old.text !== item.text)) throw new Error('Review cannot rewrite existing wording.');
    if (item.opacity <= 0 || (item.kind === 'text' && item.fill === null && !item.fidelity?.gradient && !item.stroke)) throw new Error('Review cannot hide text.');
    existing.set(item.key, item);
  }
  return PosterReconstructionPlanSchema.parse({ ...previous, summary: patch.summary, canvas: patch.canvas ?? previous.canvas, elements: [...existing.values()] });
}

export const REFERENCE_FIDELITY_INSTRUCTIONS = `
Reference fidelity extension (takes precedence over older format/approximation instructions):
- Return the compact type-specific fields in the supplied schema. Irrelevant fields are omitted by the schema and added by trusted code. Up to 120 layers are supported; inventory all wording and repeat rows before decoration.
- Treat text transcription as a separate inventory before styling. Verify punctuation, case, numbers, and line breaks from the reference and detail crops. Record unresolved glyphs in fidelity.uncertainText; never invent a replacement. Return literal text even when a font is unavailable.
- For each non-image flat layer supply fidelity with measured geometry when supported by visible evidence. Measured radius and coordinates are preserved, not cosmetically amplified. Use null fidelity for image regions and 3D text; preserve existing behavior for those.
- fidelity.gradient supports up to eight sorted color stops with opacity, linear angle or radial center/radius. In canvas.gradient use the same representation. Never approximate a radial or multi-stop gradient as two colors when the evidence supports it.
- fidelity.shadow has color, opacity, blurRatio and offsetXRatio/offsetYRatio relative to canvas height. Record only visible shadows; no invented glows or depth.
- fidelity.cornerRadii are individual corner radii relative to the smaller box dimension. fidelity.path uses explicit normalized anchors and independent incoming/outgoing Bezier controls; null handles mean corners. Include holes with evenodd when necessary. Coordinates are local to the element box. Do not approximate an asymmetric curve with symmetric tension if explicit controls improve it.
- For curved reference paths, prefer fidelity.path over legacy smooth/pathTension. A segment from node A to B uses A.outgoing then B.incoming as ABSOLUTE positions in the same local box, not offsets from the anchors. A null control collapses to its anchor; set both adjacent controls for a smooth cubic. Controls may extend outside 0..1 to reproduce curvature; do not clamp them. Keep smooth-join handles collinear with the tangent, with independently measured lengths; retain sharp corners where visible.
- Trace the complete contour in boundary order, with anchors at extrema, inflections and real corners, not uniformly spaced. Usually 3–12 anchors suffice; fidelity.path allows up to 64 for genuinely detailed silhouettes, while legacy pathPoints allows only 24. When fidelity.path is supplied, use empty legacy pathPoints to avoid two conflicting traces. For closed contours omit a duplicate final start node and provide the closing segment's last outgoing/first incoming controls. Include holes only for actual cutouts, not occlusion by another layer.
- The path box is the tight complete visible bounds including stroke. Explicit curves are fitted by their actual Bezier extrema, not their control-point hull. Trace in the poster's visible orientation with angle 0 so rotation is not applied twice. Measure peaks, valleys, endpoint positions, tangents, thickness and colors on both sides against the reference before finalizing. Trace each colored band separately and preserve overlap order; never replace an uncertain contour with a generic rectangle or symmetric wave.
- fidelity.groupKey links text to its own backing, underline and related text. Preserve observed padding, shared baselines, rotation and z-order; do not impose generic alignment. Split differently styled words/superscripts into independently placed text layers sharing that group key.
- fidelity.textBackground is only for a backing that should follow the text during editing. Do not also emit a duplicate shape. Padding is percent of font size, cornerRadius percent of background height; outlineWidth/blur are pixels in the supplied full reference image (the compiler scales them to the output canvas). Use independent shapes when backing geometry is not tied to text.
- fidelity.fillOpacity supports outline-only text. Preserve visible underline/linethrough. Otherwise use null optional effects, fillOpacity 1, false decoration flags, and empty uncertainText.
- Any detail crop is a close-up of the original image, not another poster. Its supplied box maps it into full-poster normalized coordinates. Never use crop-local coordinates for the final plan.
`;
