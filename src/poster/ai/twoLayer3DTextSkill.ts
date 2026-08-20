import { z } from 'zod';
import { normalizeCameraPose } from '../../core/cameraPose';
import { rootFieldsFromTextLayer } from '../../core/textLayerHelpers';
import type {
  CameraPose,
  EditorPerLayerFields,
  EditorState,
  HdriPreset,
  TextLayer3D,
} from '../../core/types';
import { isShapeLayer } from '../../core/types';
import type { Poster3DTextElement } from '../types';

/**
 * Stable recipe identifier used by AI plans and saved projects. Increment the
 * suffix only when a material, depth, layer-order, or camera invariant changes.
 */
export const TWO_LAYER_3D_TEXT_RECIPE_ID = 'two-layer-face-shell-v1' as const;

export const TWO_LAYER_3D_TEXT_RECIPE = {
  id: TWO_LAYER_3D_TEXT_RECIPE_ID,
  label: 'Two-layer face and shell',
  source: 'recording-derived-seed',
  schemaVersion: 1,
  layerCount: 2,
  parameters: [
    'text',
    'fontFamily',
    'customFontId',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'faceColor',
    'extrusionColor',
    'environmentId',
    'cameraPose',
    'sceneTransform',
  ],
} as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const FiniteCoordinateSchema = z.number().min(-100_000).max(100_000);

const CameraPoseSchema = z
  .object({
    position: z
      .object({
        x: z.number().min(-100).max(100),
        y: z.number().min(-100).max(100),
        z: z.number().min(-100).max(100),
      })
      .strict(),
    target: z
      .object({
        x: z.number().min(-100).max(100),
        y: z.number().min(-100).max(100),
        z: z.number().min(-100).max(100),
      })
      .strict(),
    fov: z.number().min(1).max(179),
    zoom: z.number().min(0.01).max(100),
  })
  .strict();

export const TWO_LAYER_3D_TEXT_ACCEPTED_CAMERA: CameraPose = {
  position: { x: -0.421083, y: -0.252878, z: 5.734923 },
  target: { x: 0, y: 0, z: 0 },
  fov: 45,
  zoom: 1,
};

export const TWO_LAYER_3D_TEXT_HDR_PRESETS: HdriPreset[] = [
  { id: 'silver', label: 'Silver studio', path: '/hdr/silver.hdr' },
  { id: 'golden', label: 'Golden studio', path: '/hdr/golden.hdr' },
  { id: 'light-blue', label: 'Light blue', path: '/hdr/light_blue.hdr' },
  { id: 'pink', label: 'Pink studio', path: '/hdr/pink.hdr' },
  { id: 'blue-purple', label: 'Blue purple', path: '/hdr/blue-purple.hdr' },
];

export const TwoLayer3DTextSkillInputSchema = z
  .object({
    recipeId: z.literal(TWO_LAYER_3D_TEXT_RECIPE_ID).default(TWO_LAYER_3D_TEXT_RECIPE_ID),
    text: z.string().trim().min(1).max(80),
    fontFamily: z.string().trim().min(1).max(160).default('Times New Roman, serif'),
    customFontId: z.string().trim().min(1).max(200).nullable().default(null),
    fontSize: z.number().min(48).max(160).default(120),
    fontWeight: z
      .string()
      .regex(/^(normal|bold|[1-9]00)$/)
      .default('400'),
    letterSpacing: z.number().min(-50).max(200).default(8),
    faceColor: HexColorSchema.default('#ffffff'),
    extrusionColor: HexColorSchema.default('#000000'),
    environmentId: z
      .enum(['silver', 'golden', 'light-blue', 'pink', 'blue-purple'])
      .default('golden'),
    cameraPose: CameraPoseSchema.default(TWO_LAYER_3D_TEXT_ACCEPTED_CAMERA),
    sceneTransform: z
      .object({
        positionX: z.number().min(-100).max(100).default(0),
        positionY: z.number().min(-100).max(100).default(0),
        scale: z.number().min(0.05).max(20).default(1),
      })
      .strict()
      .default({ positionX: 0, positionY: 0, scale: 1 }),
  })
  .strict();

/** Input accepted by the compiler; fields with schema defaults may be omitted. */
export type TwoLayer3DTextSkillInput = z.input<typeof TwoLayer3DTextSkillInputSchema>;
export type ResolvedTwoLayer3DTextSkillInput = z.output<typeof TwoLayer3DTextSkillInputSchema>;

export const TwoLayer3DTextPlacementInputSchema = z
  .object({
    sourceWidth: z.number().positive().max(100_000),
    sourceHeight: z.number().positive().max(100_000),
    box: z
      .object({
        left: FiniteCoordinateSchema,
        top: FiniteCoordinateSchema,
        width: z.number().positive().max(100_000),
        height: z.number().positive().max(100_000),
      })
      .strict(),
    fit: z.enum(['contain', 'stretch']).default('contain'),
    alignX: z.number().min(0).max(1).default(0.5),
    alignY: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(0.05).max(20).default(1),
    angle: z.number().min(-360).max(360).default(0),
    opacity: z.number().min(0).max(1).default(1),
  })
  .strict();

export type TwoLayer3DTextPlacementInput = z.input<
  typeof TwoLayer3DTextPlacementInputSchema
>;

export interface TwoLayer3DTextPosterPlacement {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
}

const TwoLayer3DTextElementInputSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    layerName: z.string().trim().min(1).max(200).optional(),
    image: z
      .string()
      .min(1)
      .refine(
        (value) => /^(data:image\/|blob:|https?:\/\/)/i.test(value),
        'Expected an image data URL, blob URL, or HTTP(S) URL',
      ),
    skill: TwoLayer3DTextSkillInputSchema,
    placement: TwoLayer3DTextPlacementInputSchema,
  })
  .strict();

export type TwoLayer3DTextElementInput = z.input<typeof TwoLayer3DTextElementInputSchema>;

const REAR_LAYER_ID = `${TWO_LAYER_3D_TEXT_RECIPE_ID}:rear-shell`;
const FRONT_LAYER_ID = `${TWO_LAYER_3D_TEXT_RECIPE_ID}:front-face`;
const TYPOGRAPHY_GROUP_ID = `${TWO_LAYER_3D_TEXT_RECIPE_ID}:linked-typography`;

function validXmlText(value: string): string {
  let normalized = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0xfffd;
    const valid =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    normalized += valid ? character : '\ufffd';
  }
  return normalized;
}

function escapeSvgText(value: string): string {
  return validXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSvgNumber(value: number): string {
  return stableNumber(value).toString();
}

function colorStops(color: string): Array<{ offset: number; color: string }> {
  return [
    { offset: 0, color },
    { offset: 1, color },
  ];
}

function stableNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sharedText(input: ResolvedTwoLayer3DTextSkillInput) {
  return {
    content: input.text,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    fontWeight: input.fontWeight,
    letterSpacing: input.letterSpacing,
  };
}

function rearStyle(input: ResolvedTwoLayer3DTextSkillInput): EditorPerLayerFields {
  return {
    text: sharedText(input),
    selectedCustomFontId: input.customFontId,
    extrusion: { depth: 2, steps: 10, shine: 1, angle: 0 },
    filters: { shine: 1, metallic: 1, edgeRoundness: 0.6 },
    gradientStops: colorStops(input.extrusionColor),
    gradientType: 'radial',
    extrusionGradientStops: colorStops(input.extrusionColor),
    gradientAngle: 0,
    shadowBlur: 8,
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    shadowOpacity: 0.28,
    reflectionStrength: 0,
    frontColor: input.extrusionColor,
    frontOpacity: 1,
    extrusionColor: input.extrusionColor,
    extrusionOnly: true,
    metalness: 0.9,
    roughness: 0.22,
    bevelSize: 0.16,
    bevelSegments: 10,
    bevelThickness: 0.28,
    curveSegments: 16,
    extrusionDepth: 2.4,
    frontClearcoat: 0,
    frontClearcoatRoughness: 0.1,
    frontMetalness: 0,
    frontRoughness: 0.22,
    frontEnvMapIntensity: 1,
    extrusionEnvMapIntensity: 2.2,
    frontTextureEnabled: false,
    frontTextureId: '',
    textureIntensity: 0.5,
    textureRepeatX: 2,
    textureRepeatY: 2,
    customFrontTextureUrl: null,
    customFrontTextureRoughnessUrl: null,
    customFrontTextureNormalUrl: null,
    customFrontTextureMetalnessUrl: null,
    customFrontTextureDispUrl: null,
    frontNormalStrength: 1,
    textureRoughnessIntensity: 1,
    extrusionGlass: false,
    inflate: 0.15,
    frontDecalEnabled: false,
    frontDecalDiffuseUrl: null,
    frontDecalNormalUrl: null,
    frontDecalOffsetX: 0,
    frontDecalOffsetY: 0,
    frontDecalScale: 0.35,
    frontDecalRotationDeg: 0,
    frontDecalNormalStrength: 1,
    frontDecalNormalInvert: false,
    frontDecalTintEnabled: false,
    frontDecalTintColor: '#ffffff',
  };
}

function frontStyle(input: ResolvedTwoLayer3DTextSkillInput): EditorPerLayerFields {
  return {
    text: sharedText(input),
    selectedCustomFontId: input.customFontId,
    extrusion: { depth: 1, steps: 10, shine: 0.9, angle: 0 },
    filters: { shine: 0, metallic: 0, edgeRoundness: 0 },
    gradientStops: colorStops(input.faceColor),
    gradientType: 'radial',
    extrusionGradientStops: colorStops(input.faceColor),
    gradientAngle: 0,
    shadowBlur: 6,
    shadowOffsetX: 6,
    shadowOffsetY: 6,
    shadowOpacity: 0.3,
    reflectionStrength: 0,
    frontColor: input.faceColor,
    frontOpacity: 1,
    extrusionColor: input.faceColor,
    extrusionOnly: false,
    metalness: 1,
    roughness: 0.25,
    bevelSize: 0.15,
    bevelSegments: 5,
    bevelThickness: 0.2,
    curveSegments: 12,
    extrusionDepth: 2,
    frontClearcoat: 0,
    frontClearcoatRoughness: 0.1,
    frontMetalness: 0,
    frontRoughness: 0.25,
    frontEnvMapIntensity: 1,
    extrusionEnvMapIntensity: 1,
    frontTextureEnabled: false,
    frontTextureId: '',
    textureIntensity: 0.5,
    textureRepeatX: 2,
    textureRepeatY: 2,
    customFrontTextureUrl: null,
    customFrontTextureRoughnessUrl: null,
    customFrontTextureNormalUrl: null,
    customFrontTextureMetalnessUrl: null,
    customFrontTextureDispUrl: null,
    frontNormalStrength: 1,
    textureRoughnessIntensity: 1,
    extrusionGlass: false,
    inflate: 0,
    frontDecalEnabled: false,
    frontDecalDiffuseUrl: null,
    frontDecalNormalUrl: null,
    frontDecalOffsetX: 0,
    frontDecalOffsetY: 0,
    frontDecalScale: 0.35,
    frontDecalRotationDeg: 0,
    frontDecalNormalStrength: 1,
    frontDecalNormalInvert: false,
    frontDecalTintEnabled: false,
    frontDecalTintColor: '#ffffff',
  };
}

/**
 * Compile the accepted recording into a clean, reproducible two-layer scene.
 * Fragile geometry/material values remain locked; only declared schema fields vary.
 */
export function compileTwoLayer3DTextState(input: TwoLayer3DTextSkillInput): EditorState {
  const resolved = TwoLayer3DTextSkillInputSchema.parse(input);
  const transform = resolved.sceneTransform;
  const rear: TextLayer3D = {
    id: REAR_LAYER_ID,
    linkedTypographyGroupId: TYPOGRAPHY_GROUP_ID,
    positionX: transform.positionX,
    positionY: transform.positionY,
    positionZ: 0,
    scale: transform.scale,
    ...rearStyle(resolved),
  };
  const front: TextLayer3D = {
    id: FRONT_LAYER_ID,
    linkedTypographyGroupId: TYPOGRAPHY_GROUP_ID,
    positionX: transform.positionX,
    positionY: transform.positionY,
    positionZ: 0.2,
    scale: transform.scale,
    ...frontStyle(resolved),
  };

  return {
    text: front.text,
    extrusion: front.extrusion,
    lighting: { azimuth: 270, elevation: 45, intensity: 1.2, ambient: 0.35 },
    extrusionLighting: { azimuth: 270, elevation: 45, ambient: 0.35 },
    filters: front.filters,
    ...rootFieldsFromTextLayer(front),
    renderEngine: 'webgl',
    environmentId: resolved.environmentId,
    hdrPresets: TWO_LAYER_3D_TEXT_HDR_PRESETS.map((preset) => ({ ...preset })),
    cameraPose: normalizeCameraPose(resolved.cameraPose),
    autoFrame3DContent: true,
    lightIntensity: 2,
    textLayers: [rear, front],
    activeTextLayerId: FRONT_LAYER_ID,
  };
}

/**
 * Create a lightweight two-layer SVG preview for the poster compiler.
 * The editable config remains the authoritative WebGL recipe; this preview
 * simply prevents the generated poster from looking flat before WebGL export.
 */
export function renderTwoLayer3DTextPreview(state: EditorState): string {
  const layers = state.textLayers ?? [];
  const rear = layers.find(
    (layer): layer is TextLayer3D => layer.id === REAR_LAYER_ID && !isShapeLayer(layer),
  );
  const front = layers.find(
    (layer): layer is TextLayer3D => layer.id === FRONT_LAYER_ID && !isShapeLayer(layer),
  );
  if (!rear || !front) {
    throw new Error('The two-layer face-and-shell preview requires both recipe layers.');
  }

  const text = front.text.content;
  const fontSize = front.text.fontSize;
  const letterSpacing = front.text.letterSpacing ?? 0;
  const horizontalPadding = Math.max(30, fontSize * 0.35);
  const topPadding = Math.max(28, fontSize * 0.3);
  const shellDepth = Math.max(10, Math.min(28, fontSize * 0.16));
  const estimatedTextWidth = Math.max(
    fontSize,
    text.length * fontSize * 0.68 + Math.max(0, text.length - 1) * letterSpacing,
  );
  const width = Math.ceil(estimatedTextWidth + horizontalPadding * 2 + shellDepth);
  const height = Math.ceil(fontSize * 1.22 + topPadding * 2 + shellDepth);
  const x = horizontalPadding;
  const baseline = topPadding + fontSize;
  const faceColor = front.frontColor ?? '#ffffff';
  const shellColor = rear.extrusionColor ?? '#000000';
  const fontFamily = escapeSvgText(front.text.fontFamily);
  const safeText = escapeSvgText(text);
  const fontWeight = escapeSvgText(front.text.fontWeight);
  const commonAttributes = `font-family="${fontFamily}" font-size="${formatSvgNumber(fontSize)}" font-weight="${fontWeight}" letter-spacing="${formatSvgNumber(letterSpacing)}"`;
  const shellSteps = Array.from({ length: 12 }, (_, index) => {
    const progress = (12 - index) / 12;
    const offsetX = shellDepth * progress;
    const offsetY = shellDepth * progress * 0.62;
    return `<text x="${formatSvgNumber(x + offsetX)}" y="${formatSvgNumber(baseline + offsetY)}" ${commonAttributes} fill="url(#two-layer-shell)" stroke="${escapeSvgText(shellColor)}" stroke-width="${formatSvgNumber(Math.max(1, fontSize * 0.018))}" stroke-linejoin="round">${safeText}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Two-layer 3D text preview">
  <defs>
    <linearGradient id="two-layer-shell" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeSvgText(shellColor)}" stop-opacity="0.72"/>
      <stop offset="0.42" stop-color="${escapeSvgText(shellColor)}"/>
      <stop offset="0.7" stop-color="#000000" stop-opacity="0.74"/>
      <stop offset="1" stop-color="${escapeSvgText(shellColor)}"/>
    </linearGradient>
    <linearGradient id="two-layer-face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/>
      <stop offset="0.2" stop-color="${escapeSvgText(faceColor)}"/>
      <stop offset="0.78" stop-color="${escapeSvgText(faceColor)}"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <filter id="two-layer-shadow" x="-20%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="${formatSvgNumber(shellDepth * 0.45)}" dy="${formatSvgNumber(shellDepth * 0.5)}" stdDeviation="${formatSvgNumber(Math.max(2, fontSize * 0.035))}" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <g filter="url(#two-layer-shadow)">${shellSteps}</g>
  <text x="${formatSvgNumber(x)}" y="${formatSvgNumber(baseline)}" ${commonAttributes} fill="url(#two-layer-face)" stroke="${escapeSvgText(shellColor)}" stroke-width="${formatSvgNumber(Math.max(1, fontSize * 0.012))}" stroke-linejoin="round">${safeText}</text>
</svg>`;
}

/**
 * Replace the wording in a saved two-layer recipe while preserving its colors,
 * materials, camera, and transform. Returns null for unrelated 3D scenes.
 */
export function replaceTwoLayer3DTextContent(
  state: Partial<EditorState>,
  content: string,
): EditorState | null {
  const layers = state.textLayers;
  const rear = layers?.find(
    (layer): layer is TextLayer3D => layer.id === REAR_LAYER_ID && !isShapeLayer(layer),
  );
  const front = layers?.find(
    (layer): layer is TextLayer3D => layer.id === FRONT_LAYER_ID && !isShapeLayer(layer),
  );
  if (!state.text || !layers || !rear || !front) return null;

  const text = { ...front.text, content };
  return {
    ...(state as EditorState),
    text,
    textLayers: layers.map((layer) =>
      layer.id === REAR_LAYER_ID || layer.id === FRONT_LAYER_ID
        ? { ...layer, text }
        : layer,
    ),
  };
}

/** Fit a rendered transparent 3D image into a poster box without rasterizing it again. */
export function fitTwoLayer3DTextPlacement(
  input: TwoLayer3DTextPlacementInput,
): TwoLayer3DTextPosterPlacement {
  const resolved = TwoLayer3DTextPlacementInputSchema.parse(input);
  const { box, sourceWidth, sourceHeight } = resolved;
  const containScale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const baseScaleX = resolved.fit === 'contain' ? containScale : box.width / sourceWidth;
  const baseScaleY = resolved.fit === 'contain' ? containScale : box.height / sourceHeight;
  const scaleX = baseScaleX * resolved.scale;
  const scaleY = baseScaleY * resolved.scale;
  const shownWidth = sourceWidth * scaleX;
  const shownHeight = sourceHeight * scaleY;

  return {
    left: stableNumber(box.left + (box.width - shownWidth) * resolved.alignX),
    top: stableNumber(box.top + (box.height - shownHeight) * resolved.alignY),
    scaleX: stableNumber(scaleX),
    scaleY: stableNumber(scaleY),
    angle: resolved.angle,
    opacity: resolved.opacity,
  };
}

/** Build an editable poster element from a WebGL export and the same recipe input. */
export function compileTwoLayer3DTextElement(
  input: TwoLayer3DTextElementInput,
): Omit<Poster3DTextElement, 'zIndex'> {
  const resolved = TwoLayer3DTextElementInputSchema.parse(input);
  return {
    id: resolved.id,
    ...(resolved.layerName ? { layerName: resolved.layerName } : {}),
    type: '3d-text',
    image: resolved.image,
    config: compileTwoLayer3DTextState(resolved.skill),
    ...fitTwoLayer3DTextPlacement(resolved.placement),
  };
}
