import { z } from 'zod';

export const POSTER_RECONSTRUCTION_SCHEMA_VERSION = 11 as const;
export const POSTER_RECONSTRUCTION_PROMPT_VERSION =
  'poster-reconstruction-v11-verified-text-extrusion' as const;

export const RECONSTRUCTION_ICON_NAMES = [
  'none',
  'calendar',
  'clock',
  'location',
  'phone',
  'web',
  'facebook',
  'instagram',
  'youtube',
  'x',
  'tiktok',
  'linkedin',
  'whatsapp',
] as const;

export const RECONSTRUCTION_FONT_TOKENS = [
  'arial',
  'arial_black',
  'allura',
  'anton',
  'bebas_neue',
  'chewy',
  'courier_new',
  'crimson_pro',
  'dancing_script',
  'fredoka',
  'georgia',
  'great_vibes',
  'impact',
  'inter',
  'lato',
  'lilita_one',
  'luckiest_guy',
  'merriweather',
  'modak',
  'montserrat',
  'nunito',
  'open_sans',
  'oswald',
  'pacifico',
  'playfair_display',
  'poppins',
  'raleway',
  'roboto',
  'sacramento',
  'satisfy',
  'source_sans_3',
  'tangerine',
  'times_new_roman',
  'trebuchet_ms',
  'verdana',
] as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NullableHexColorSchema = HexColorSchema.nullable();
const FieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/).nullable();

export const ReconstructionBoxSchema = z
  .object({
    // Native geometry can extend beyond the canvas when the reference clips it
    // at an edge (for example, a large circle whose top is outside the poster).
    x: z.number().min(-0.5).max(1.5),
    y: z.number().min(-0.5).max(1.5),
    width: z.number().min(0.005).max(1.5),
    height: z.number().min(0.005).max(1.5),
  })
  .strict();

export const ReconstructionPathPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    smooth: z.boolean(),
  })
  .strict();

export const ReconstructionElementSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    kind: z.enum(['text', 'rect', 'circle', 'ellipse', 'triangle', 'star', 'line', 'path', 'image_region']),
    label: z.string().trim().min(1).max(100),
    box: ReconstructionBoxSchema,
    angle: z.number().min(-180).max(180),
    opacity: z.number().min(0).max(1),
    zIndex: z.number().int().min(1).max(200),
    fill: NullableHexColorSchema,
    textFillType: z.enum(['solid', 'linear']).default('solid'),
    textFillStart: NullableHexColorSchema.default(null),
    textFillEnd: NullableHexColorSchema.default(null),
    textFillAngle: z.number().min(0).max(360).default(0),
    stroke: NullableHexColorSchema,
    strokeWidthRatio: z.number().min(0).max(0.05),
    text: z.string().max(500),
    fontFamily: z.enum(RECONSTRUCTION_FONT_TOKENS),
    fontCatalogId: z.string().regex(/^c_[a-z0-9_]{1,40}$/).nullable().optional(),
    fontSizeRatio: z.number().min(0.004).max(0.3),
    fontWeight: z.enum(['400', '500', '600', '700', '800', '900']),
    fontStyle: z.enum(['normal', 'italic']),
    textAlign: z.enum(['left', 'center', 'right']),
    charSpacing: z.number().min(-250).max(1200),
    lineHeight: z.number().min(0.7).max(3),
    visibleLineCount: z.number().int().min(0).max(20).default(0),
    textEffect: z.enum(['flat', 'two_layer_3d']),
    textHasVisibleExtrusion: z.boolean().default(false),
    textExtrusionDepthRatio: z.number().min(0).max(1).default(0),
    extrusionColor: NullableHexColorSchema,
    cornerRadiusRatio: z.number().min(0).max(0.5),
    cornerStyle: z.enum(['auto', 'sharp', 'subtle', 'rounded', 'pill']).default('auto'),
    pathPoints: z.array(ReconstructionPathPointSchema).max(8),
    pathClosed: z.boolean(),
    pathTension: z.number().min(0.1).max(0.45),
    imageRole: z.enum([
      'none',
      'person',
      'logo',
      'photo',
      'background_photo',
      'icon',
      'decoration',
    ]),
    imageMask: z.enum(['none', 'circle', 'ellipse', 'rounded_rect']).default('none'),
    imageCutout: z.boolean().default(false),
    imageEdge: z.enum(['none', 'fade']).default('none'),
    imageFadeDirection: z.enum(['radial', 'bottom']).default('radial'),
    imageFadeAmount: z.number().min(0).max(1).default(0.35),
    imageFadeMinOpacity: z.number().min(0).max(1).default(0),
    imageBrightness: z.number().min(-100).max(100).default(0),
    imageContrast: z.number().min(-100).max(100).default(0),
    imageSaturation: z.number().min(-100).max(100).default(0),
    imageBlur: z.number().min(0).max(100).default(0),
    imageTintColor: NullableHexColorSchema.default(null),
    imageTintAmount: z.number().min(0).max(100).default(0),
    imageHasOverlays: z.boolean(),
    replacementRecommended: z.boolean(),
    replacementReason: z.string().max(180),
    imageSearchQuery: z.string().max(120),
    imageDominantColor: NullableHexColorSchema,
    iconName: z.enum(RECONSTRUCTION_ICON_NAMES),
    suggestedFieldKey: FieldKeySchema,
    suggestedFieldLabel: z.string().max(80),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ReconstructionElement = z.infer<typeof ReconstructionElementSchema>;

export const PosterReconstructionPlanSchema = z
  .object({
    schemaVersion: z.literal(POSTER_RECONSTRUCTION_SCHEMA_VERSION),
    suggestedTemplateName: z.string().trim().min(1).max(100),
    category: z.enum(['church', 'conference', 'business', 'event', 'general']),
    summary: z.string().trim().min(1).max(500),
    canvas: z
      .object({
        backgroundType: z.enum(['solid', 'linear']),
        backgroundTop: HexColorSchema,
        backgroundBottom: HexColorSchema,
        gradientAngle: z.number().min(0).max(360),
      })
      .strict(),
    elements: z.array(ReconstructionElementSchema).max(45),
    warnings: z.array(z.string().max(180)).max(12),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type PosterReconstructionPlan = z.infer<typeof PosterReconstructionPlanSchema>;

export const ReconstructionFontCatalogEntrySchema = z
  .object({
    id: z.string().regex(/^c_[a-z0-9_]{1,40}$/),
    label: z.string().trim().min(1).max(120),
  })
  .strict();

export type ReconstructionFontCatalogEntry = z.infer<typeof ReconstructionFontCatalogEntrySchema>;

export const ReconstructionFontCatalogSchema = z
  .object({
    entries: z.array(ReconstructionFontCatalogEntrySchema).max(200),
    previewDataUrls: z
      .array(z.string().regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/))
      .max(6),
  })
  .strict();

export type ReconstructionFontCatalog = z.infer<typeof ReconstructionFontCatalogSchema>;

export const PosterReconstructionRequestSchema = z
  .object({
    reference: z
      .object({
        dataUrl: z.string().min(32),
        width: z.number().int().min(64).max(4096),
        height: z.number().int().min(64).max(4096),
      })
      .strict(),
    quality: z.enum(['quality']),
    fontCatalog: ReconstructionFontCatalogSchema.optional(),
  })
  .strict();

export type PosterReconstructionRequest = z.infer<typeof PosterReconstructionRequestSchema>;
export type PosterReconstructionSource = 'openai' | 'cache' | 'fallback';

export interface PosterReconstructionResponse {
  plan: PosterReconstructionPlan;
  source: PosterReconstructionSource;
  model: string | null;
  requestId: string;
}

type JsonSchema = Record<string, unknown>;

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function nullable(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: 'null' }] };
}

const boxJsonSchema = strictObject({
  x: { type: 'number', minimum: -0.5, maximum: 1.5 },
  y: { type: 'number', minimum: -0.5, maximum: 1.5 },
  width: { type: 'number', minimum: 0.005, maximum: 1.5 },
  height: { type: 'number', minimum: 0.005, maximum: 1.5 },
});

const pathPointJsonSchema = strictObject({
  x: { type: 'number', minimum: 0, maximum: 1 },
  y: { type: 'number', minimum: 0, maximum: 1 },
  smooth: { type: 'boolean' },
});

const hexJsonSchema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const fieldKeyJsonSchema = {
  type: 'string',
  pattern: '^[a-z][a-z0-9_]{0,47}$',
};

export const POSTER_RECONSTRUCTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'suggestedTemplateName',
    'category',
    'summary',
    'canvas',
    'elements',
    'warnings',
    'confidence',
  ],
  properties: {
    schemaVersion: { type: 'integer', const: POSTER_RECONSTRUCTION_SCHEMA_VERSION },
    suggestedTemplateName: { type: 'string', minLength: 1, maxLength: 100 },
    category: {
      type: 'string',
      enum: ['church', 'conference', 'business', 'event', 'general'],
    },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    canvas: strictObject({
      backgroundType: { type: 'string', enum: ['solid', 'linear'] },
      backgroundTop: hexJsonSchema,
      backgroundBottom: hexJsonSchema,
      gradientAngle: { type: 'number', minimum: 0, maximum: 360 },
    }),
    elements: {
      type: 'array',
      maxItems: 45,
      items: strictObject({
        key: fieldKeyJsonSchema,
        kind: {
          type: 'string',
          enum: ['text', 'rect', 'circle', 'ellipse', 'triangle', 'star', 'line', 'path', 'image_region'],
        },
        label: { type: 'string', minLength: 1, maxLength: 100 },
        box: boxJsonSchema,
        angle: { type: 'number', minimum: -180, maximum: 180 },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
        zIndex: { type: 'integer', minimum: 1, maximum: 200 },
        fill: nullable(hexJsonSchema),
        textFillType: { type: 'string', enum: ['solid', 'linear'] },
        textFillStart: nullable(hexJsonSchema),
        textFillEnd: nullable(hexJsonSchema),
        textFillAngle: { type: 'number', minimum: 0, maximum: 360 },
        stroke: nullable(hexJsonSchema),
        strokeWidthRatio: { type: 'number', minimum: 0, maximum: 0.05 },
        text: { type: 'string', maxLength: 500 },
        fontFamily: { type: 'string', enum: [...RECONSTRUCTION_FONT_TOKENS] },
        fontCatalogId: nullable({
          type: 'string',
          pattern: '^c_[a-z0-9_]{1,40}$',
        }),
        fontSizeRatio: { type: 'number', minimum: 0.004, maximum: 0.3 },
        fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800', '900'] },
        fontStyle: { type: 'string', enum: ['normal', 'italic'] },
        textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
        charSpacing: { type: 'number', minimum: -250, maximum: 1200 },
        lineHeight: { type: 'number', minimum: 0.7, maximum: 3 },
        visibleLineCount: { type: 'integer', minimum: 0, maximum: 20 },
        textEffect: { type: 'string', enum: ['flat', 'two_layer_3d'] },
        textHasVisibleExtrusion: { type: 'boolean' },
        textExtrusionDepthRatio: { type: 'number', minimum: 0, maximum: 1 },
        extrusionColor: nullable(hexJsonSchema),
        cornerRadiusRatio: { type: 'number', minimum: 0, maximum: 0.5 },
        cornerStyle: {
          type: 'string',
          enum: ['auto', 'sharp', 'subtle', 'rounded', 'pill'],
        },
        pathPoints: {
          type: 'array',
          maxItems: 8,
          items: pathPointJsonSchema,
        },
        pathClosed: { type: 'boolean' },
        pathTension: { type: 'number', minimum: 0.1, maximum: 0.45 },
        imageRole: {
          type: 'string',
          enum: [
            'none',
            'person',
            'logo',
            'photo',
            'background_photo',
            'icon',
            'decoration',
          ],
        },
        imageMask: {
          type: 'string',
          enum: ['none', 'circle', 'ellipse', 'rounded_rect'],
        },
        imageCutout: { type: 'boolean' },
        imageEdge: { type: 'string', enum: ['none', 'fade'] },
        imageFadeDirection: { type: 'string', enum: ['radial', 'bottom'] },
        imageFadeAmount: { type: 'number', minimum: 0, maximum: 1 },
        imageFadeMinOpacity: { type: 'number', minimum: 0, maximum: 1 },
        imageBrightness: { type: 'number', minimum: -100, maximum: 100 },
        imageContrast: { type: 'number', minimum: -100, maximum: 100 },
        imageSaturation: { type: 'number', minimum: -100, maximum: 100 },
        imageBlur: { type: 'number', minimum: 0, maximum: 100 },
        imageTintColor: nullable(hexJsonSchema),
        imageTintAmount: { type: 'number', minimum: 0, maximum: 100 },
        imageHasOverlays: { type: 'boolean' },
        replacementRecommended: { type: 'boolean' },
        replacementReason: { type: 'string', maxLength: 180 },
        imageSearchQuery: { type: 'string', maxLength: 120 },
        imageDominantColor: nullable(hexJsonSchema),
        iconName: {
          type: 'string',
          enum: [...RECONSTRUCTION_ICON_NAMES],
        },
        suggestedFieldKey: nullable(fieldKeyJsonSchema),
        suggestedFieldLabel: { type: 'string', maxLength: 80 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      }),
    },
    warnings: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', maxLength: 180 },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

export function createFallbackReconstructionPlan(): PosterReconstructionPlan {
  return PosterReconstructionPlanSchema.parse({
    schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
    suggestedTemplateName: 'Imported poster template',
    category: 'general',
    summary: 'A tracing guide was prepared because AI reconstruction is not configured locally.',
    canvas: {
      backgroundType: 'solid',
      backgroundTop: '#ffffff',
      backgroundBottom: '#ffffff',
      gradientAngle: 180,
    },
    elements: [],
    warnings: [
      'AI reconstruction is not configured. Use the locked reference guide to recreate and label the template.',
    ],
    confidence: 0,
  });
}
