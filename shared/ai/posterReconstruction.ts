import { z } from 'zod';

export const POSTER_RECONSTRUCTION_SCHEMA_VERSION = 4 as const;
export const POSTER_RECONSTRUCTION_PROMPT_VERSION = 'poster-reconstruction-v5' as const;

export const RECONSTRUCTION_FONT_TOKENS = [
  'arial',
  'arial_black',
  'allura',
  'bebas_neue',
  'courier_new',
  'crimson_pro',
  'dancing_script',
  'georgia',
  'great_vibes',
  'impact',
  'inter',
  'lato',
  'merriweather',
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
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.005).max(1),
    height: z.number().min(0.005).max(1),
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
    kind: z.enum(['text', 'rect', 'circle', 'ellipse', 'line', 'path', 'image_region']),
    label: z.string().trim().min(1).max(100),
    box: ReconstructionBoxSchema,
    angle: z.number().min(-180).max(180),
    opacity: z.number().min(0).max(1),
    zIndex: z.number().int().min(1).max(200),
    fill: NullableHexColorSchema,
    stroke: NullableHexColorSchema,
    strokeWidthRatio: z.number().min(0).max(0.05),
    text: z.string().max(500),
    fontFamily: z.enum(RECONSTRUCTION_FONT_TOKENS),
    fontSizeRatio: z.number().min(0.004).max(0.3),
    fontWeight: z.enum(['400', '500', '600', '700', '800', '900']),
    fontStyle: z.enum(['normal', 'italic']),
    textAlign: z.enum(['left', 'center', 'right']),
    charSpacing: z.number().min(-250).max(1200),
    lineHeight: z.number().min(0.7).max(3),
    textEffect: z.enum(['flat', 'two_layer_3d']),
    extrusionColor: NullableHexColorSchema,
    cornerRadiusRatio: z.number().min(0).max(0.5),
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
    imageHasOverlays: z.boolean(),
    replacementRecommended: z.boolean(),
    replacementReason: z.string().max(180),
    imageSearchQuery: z.string().max(120),
    imageDominantColor: NullableHexColorSchema,
    iconName: z.enum(['none', 'calendar', 'clock', 'location', 'phone', 'web']),
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
  x: { type: 'number', minimum: 0, maximum: 1 },
  y: { type: 'number', minimum: 0, maximum: 1 },
  width: { type: 'number', minimum: 0.005, maximum: 1 },
  height: { type: 'number', minimum: 0.005, maximum: 1 },
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
          enum: ['text', 'rect', 'circle', 'ellipse', 'line', 'path', 'image_region'],
        },
        label: { type: 'string', minLength: 1, maxLength: 100 },
        box: boxJsonSchema,
        angle: { type: 'number', minimum: -180, maximum: 180 },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
        zIndex: { type: 'integer', minimum: 1, maximum: 200 },
        fill: nullable(hexJsonSchema),
        stroke: nullable(hexJsonSchema),
        strokeWidthRatio: { type: 'number', minimum: 0, maximum: 0.05 },
        text: { type: 'string', maxLength: 500 },
        fontFamily: { type: 'string', enum: [...RECONSTRUCTION_FONT_TOKENS] },
        fontSizeRatio: { type: 'number', minimum: 0.004, maximum: 0.3 },
        fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800', '900'] },
        fontStyle: { type: 'string', enum: ['normal', 'italic'] },
        textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
        charSpacing: { type: 'number', minimum: -250, maximum: 1200 },
        lineHeight: { type: 'number', minimum: 0.7, maximum: 3 },
        textEffect: { type: 'string', enum: ['flat', 'two_layer_3d'] },
        extrusionColor: nullable(hexJsonSchema),
        cornerRadiusRatio: { type: 'number', minimum: 0, maximum: 0.5 },
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
        imageHasOverlays: { type: 'boolean' },
        replacementRecommended: { type: 'boolean' },
        replacementReason: { type: 'string', maxLength: 180 },
        imageSearchQuery: { type: 'string', maxLength: 120 },
        imageDominantColor: nullable(hexJsonSchema),
        iconName: {
          type: 'string',
          enum: ['none', 'calendar', 'clock', 'location', 'phone', 'web'],
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
