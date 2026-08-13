import { z } from 'zod';

export const POSTER_PLAN_SCHEMA_VERSION = 1 as const;
export const POSTER_PLAN_PROMPT_VERSION = 'poster-planner-v2' as const;
export const POSTER_RECIPE_CATALOG_VERSION = 'easyposter-recipes-v2' as const;

export const POSTER_HEADLINE_RECIPES = [
  'metal_green_ivory',
  'metal_gold_dark',
  'clean_bold',
  'two_layer_face_shell_v1',
] as const;

export type PosterHeadlineRecipe = (typeof POSTER_HEADLINE_RECIPES)[number];

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const NormalizedBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.03).max(1),
    height: z.number().min(0.02).max(1),
  })
  .strict();

export type NormalizedBox = z.infer<typeof NormalizedBoxSchema>;

export const PosterPersonSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(80),
  })
  .strict();

export const PosterBriefSchema = z
  .object({
    organization: z.string().trim().min(1).max(180),
    presenterLine: z.string().trim().max(60),
    year: z.string().trim().max(20),
    eventTitle: z.string().trim().min(1).max(100),
    themeLabel: z.string().trim().max(30),
    theme: z.string().trim().max(180),
    scripture: z.string().trim().max(260),
    date: z.string().trim().max(80),
    time: z.string().trim().max(80),
    venue: z.string().trim().max(180),
    people: z.array(PosterPersonSchema).min(1).max(4),
  })
  .strict();

export type PosterBrief = z.infer<typeof PosterBriefSchema>;

export const PosterPlanRequestSchema = z
  .object({
    reference: z
      .object({
        dataUrl: z.string().min(32),
        width: z.number().int().min(64).max(4096),
        height: z.number().int().min(64).max(4096),
      })
      .strict(),
    brief: PosterBriefSchema,
    quality: z.enum(['economy', 'quality']),
  })
  .strict();

export type PosterPlanRequest = z.infer<typeof PosterPlanRequestSchema>;

export const PosterDesignPlanSchema = z
  .object({
    schemaVersion: z.literal(POSTER_PLAN_SCHEMA_VERSION),
    templateFamily: z.enum([
      'church_event_four_speakers',
      'conference_four_speakers',
      'generic_event',
    ]),
    recipes: z
      .object({
        background: z.enum(['green_atmosphere', 'deep_gradient', 'soft_neutral']),
        headline: z.enum(POSTER_HEADLINE_RECIPES),
        banner: z.enum(['rounded_chevron', 'simple_panel', 'none']),
        portraits: z.enum(['four_center_host', 'balanced_row', 'single_focus']),
        footer: z.enum(['two_band', 'single_band', 'minimal']),
      })
      .strict(),
    palette: z
      .object({
        backgroundTop: HexColorSchema,
        backgroundBottom: HexColorSchema,
        accent: HexColorSchema,
        accentDark: HexColorSchema,
        face: HexColorSchema,
        text: HexColorSchema,
        muted: HexColorSchema,
      })
      .strict(),
    typography: z
      .object({
        headline: z.enum(['arial_black', 'impact', 'georgia_bold']),
        body: z.enum(['arial', 'georgia', 'trebuchet']),
        script: z.enum(['georgia_italic', 'cursive', 'trebuchet_italic']),
      })
      .strict(),
    layout: z
      .object({
        header: NormalizedBoxSchema,
        kicker: NormalizedBoxSchema,
        headlinePrimary: NormalizedBoxSchema,
        headlineSecondary: NormalizedBoxSchema,
        themeBanner: NormalizedBoxSchema,
        portraits: NormalizedBoxSchema,
        footer: NormalizedBoxSchema,
        portraitSlots: z
          .array(
            z
              .object({
                personIndex: z.number().int().min(0).max(3),
                box: NormalizedBoxSchema,
                prominence: z.number().min(0).max(1),
              })
              .strict(),
          )
          .min(1)
          .max(4),
      })
      .strict(),
    confidence: z.number().min(0).max(1),
    unsupportedFeatures: z.array(z.string().max(160)).max(8),
  })
  .strict();

export type PosterDesignPlan = z.infer<typeof PosterDesignPlanSchema>;

export type PosterPlanSource = 'openai' | 'cache' | 'fallback';

export interface PosterPlanResponse {
  plan: PosterDesignPlan;
  source: PosterPlanSource;
  model: string | null;
  requestId: string;
}

/**
 * Strict JSON Schema sent to the Responses API. The planner may select and
 * parameterize recipes, but it cannot return executable code, URLs, or SVG.
 */
export const POSTER_DESIGN_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'templateFamily',
    'recipes',
    'palette',
    'typography',
    'layout',
    'confidence',
    'unsupportedFeatures',
  ],
  properties: {
    schemaVersion: { type: 'integer', const: POSTER_PLAN_SCHEMA_VERSION },
    templateFamily: {
      type: 'string',
      enum: [
        'church_event_four_speakers',
        'conference_four_speakers',
        'generic_event',
      ],
    },
    recipes: strictObject({
      background: { type: 'string', enum: ['green_atmosphere', 'deep_gradient', 'soft_neutral'] },
      headline: { type: 'string', enum: [...POSTER_HEADLINE_RECIPES] },
      banner: { type: 'string', enum: ['rounded_chevron', 'simple_panel', 'none'] },
      portraits: { type: 'string', enum: ['four_center_host', 'balanced_row', 'single_focus'] },
      footer: { type: 'string', enum: ['two_band', 'single_band', 'minimal'] },
    }),
    palette: strictObject({
      backgroundTop: hexColorJsonSchema(),
      backgroundBottom: hexColorJsonSchema(),
      accent: hexColorJsonSchema(),
      accentDark: hexColorJsonSchema(),
      face: hexColorJsonSchema(),
      text: hexColorJsonSchema(),
      muted: hexColorJsonSchema(),
    }),
    typography: strictObject({
      headline: { type: 'string', enum: ['arial_black', 'impact', 'georgia_bold'] },
      body: { type: 'string', enum: ['arial', 'georgia', 'trebuchet'] },
      script: { type: 'string', enum: ['georgia_italic', 'cursive', 'trebuchet_italic'] },
    }),
    layout: strictObject({
      header: boxJsonSchema(),
      kicker: boxJsonSchema(),
      headlinePrimary: boxJsonSchema(),
      headlineSecondary: boxJsonSchema(),
      themeBanner: boxJsonSchema(),
      portraits: boxJsonSchema(),
      footer: boxJsonSchema(),
      portraitSlots: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: strictObject({
          personIndex: { type: 'integer', minimum: 0, maximum: 3 },
          box: boxJsonSchema(),
          prominence: { type: 'number', minimum: 0, maximum: 1 },
        }),
      },
    }),
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    unsupportedFeatures: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 160 },
    },
  },
} as const;

type JsonSchema = Record<string, unknown>;

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function boxJsonSchema(): JsonSchema {
  return strictObject({
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    width: { type: 'number', minimum: 0.03, maximum: 1 },
    height: { type: 'number', minimum: 0.02, maximum: 1 },
  });
}

function hexColorJsonSchema(): JsonSchema {
  return { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
}

export function createFallbackPosterPlan(peopleCount: number): PosterDesignPlan {
  const slots = [
    { personIndex: 0, box: { x: 0.015, y: 0.49, width: 0.25, height: 0.34 }, prominence: 0.58 },
    { personIndex: 1, box: { x: 0.17, y: 0.48, width: 0.3, height: 0.36 }, prominence: 0.7 },
    { personIndex: 2, box: { x: 0.39, y: 0.45, width: 0.39, height: 0.4 }, prominence: 1 },
    { personIndex: 3, box: { x: 0.72, y: 0.49, width: 0.27, height: 0.35 }, prominence: 0.66 },
  ].slice(0, Math.max(1, Math.min(4, peopleCount)));

  return PosterDesignPlanSchema.parse({
    schemaVersion: POSTER_PLAN_SCHEMA_VERSION,
    templateFamily: 'church_event_four_speakers',
    recipes: {
      background: 'green_atmosphere',
      headline: 'metal_green_ivory',
      banner: 'rounded_chevron',
      portraits: 'four_center_host',
      footer: 'two_band',
    },
    palette: {
      backgroundTop: '#315b48',
      backgroundBottom: '#9ca89d',
      accent: '#008450',
      accentDark: '#003d2b',
      face: '#eee9dd',
      text: '#111111',
      muted: '#a9a56f',
    },
    typography: {
      headline: 'arial_black',
      body: 'arial',
      script: 'georgia_italic',
    },
    layout: {
      header: { x: 0.025, y: 0.015, width: 0.95, height: 0.035 },
      kicker: { x: 0.08, y: 0.062, width: 0.35, height: 0.06 },
      headlinePrimary: { x: 0.075, y: 0.12, width: 0.82, height: 0.14 },
      headlineSecondary: { x: 0.055, y: 0.255, width: 0.84, height: 0.09 },
      themeBanner: { x: 0.07, y: 0.35, width: 0.84, height: 0.125 },
      portraits: { x: 0, y: 0.46, width: 1, height: 0.39 },
      footer: { x: 0, y: 0.86, width: 1, height: 0.14 },
      portraitSlots: slots,
    },
    confidence: 0.62,
    unsupportedFeatures: [
      'Automatic portrait background removal is not part of this first version.',
      'The initial 3D preview approximates the reference material and remains re-editable.',
    ],
  });
}
