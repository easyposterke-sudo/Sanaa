import { z } from 'zod';
import {
  POSTER_RECONSTRUCTION_JSON_SCHEMA,
  PosterReconstructionPlanSchema,
  type PosterReconstructionPlan,
} from './posterReconstruction';

export const POSTER_CREATIVE_AGENT_SCHEMA_VERSION = 1 as const;
export const POSTER_CREATIVE_AGENT_PROMPT_VERSION = 'poster-creative-agent-v1' as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PosterCreativeSkillSchema = z.enum([
  'brief_interpreter',
  'reference_analyzer',
  'layout_architect',
  'typography_director',
  'color_director',
  'image_director',
  'shape_composer',
  'editable_reconstructor',
  'geometry_inspector',
  'visual_critic',
]);

export type PosterCreativeSkill = z.infer<typeof PosterCreativeSkillSchema>;

export const CreativeLayoutBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.03).max(1),
    height: z.number().min(0.03).max(1),
  })
  .strict();

export const CreativeLayoutGroupSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    label: z.string().trim().min(1).max(80),
    elementKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,47}$/)).min(1).max(12),
    region: CreativeLayoutBoxSchema,
    direction: z.enum(['row', 'column', 'free']),
    align: z.enum(['left', 'center', 'right']),
    gapRatio: z.number().min(0).max(0.12),
    priority: z.number().int().min(1).max(10),
  })
  .strict();

export type CreativeLayoutGroup = z.infer<typeof CreativeLayoutGroupSchema>;

export const CreativeExclusionZoneSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    elementKey: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    paddingRatio: z.number().min(0).max(0.12),
    protectedGroupIds: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,47}$/)).max(12),
  })
  .strict();

export const PosterCreativeComposeRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    mode: z.enum(['original', 'reference']),
    brief: z.string().trim().min(10).max(4_000),
    categoryId: z.string().trim().min(1).max(80).nullable(),
    themeColor: HexColorSchema.nullable(),
    canvas: z
      .object({
        width: z.number().int().min(320).max(4096),
        height: z.number().int().min(320).max(4096),
      })
      .strict(),
    images: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(7),
            name: z.string().trim().max(100),
            role: z.string().trim().max(100),
          })
          .strict(),
      )
      .max(8),
    reference: z
      .object({
        dataUrl: z.string().startsWith('data:image/').max(2_500_000),
        width: z.number().int().min(64).max(4096),
        height: z.number().int().min(64).max(4096),
      })
      .strict()
      .nullable(),
    maxRevisions: z.number().int().min(0).max(2).default(2),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.mode === 'reference' && !request.reference) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Reference mode requires a reference poster.',
      });
    }
  });

export type PosterCreativeComposeRequest = z.infer<typeof PosterCreativeComposeRequestSchema>;
export type PosterCreativeComposeRequestInput = z.input<typeof PosterCreativeComposeRequestSchema>;

export const PosterCreativeCompositionSchema = z
  .object({
    schemaVersion: z.literal(POSTER_CREATIVE_AGENT_SCHEMA_VERSION),
    mode: z.enum(['original', 'reference']),
    concept: z.string().trim().min(1).max(400),
    skillsUsed: z.array(PosterCreativeSkillSchema).min(3).max(10),
    plan: PosterReconstructionPlanSchema,
    groups: z.array(CreativeLayoutGroupSchema).min(1).max(16),
    exclusions: z.array(CreativeExclusionZoneSchema).max(8),
  })
  .strict();

export type PosterCreativeComposition = z.infer<typeof PosterCreativeCompositionSchema>;

export interface PosterCreativeComposeResponse {
  composition: PosterCreativeComposition;
  source: 'openai' | 'fallback';
  model: string | null;
  requestId: string;
  inputTokens: number | null;
  outputTokens: number | null;
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

const creativeBoxJsonSchema = strictObject({
  x: { type: 'number', minimum: 0, maximum: 1 },
  y: { type: 'number', minimum: 0, maximum: 1 },
  width: { type: 'number', minimum: 0.03, maximum: 1 },
  height: { type: 'number', minimum: 0.03, maximum: 1 },
});

export const POSTER_CREATIVE_COMPOSITION_JSON_SCHEMA = strictObject({
  schemaVersion: { type: 'integer', const: POSTER_CREATIVE_AGENT_SCHEMA_VERSION },
  mode: { type: 'string', enum: ['original', 'reference'] },
  concept: { type: 'string', minLength: 1, maxLength: 400 },
  skillsUsed: {
    type: 'array',
    minItems: 3,
    maxItems: 10,
    items: { type: 'string', enum: [...PosterCreativeSkillSchema.options] },
  },
  plan: POSTER_RECONSTRUCTION_JSON_SCHEMA as unknown as JsonSchema,
  groups: {
    type: 'array',
    minItems: 1,
    maxItems: 16,
    items: strictObject({
      id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
      label: { type: 'string', minLength: 1, maxLength: 80 },
      elementKeys: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
      },
      region: creativeBoxJsonSchema,
      direction: { type: 'string', enum: ['row', 'column', 'free'] },
      align: { type: 'string', enum: ['left', 'center', 'right'] },
      gapRatio: { type: 'number', minimum: 0, maximum: 0.12 },
      priority: { type: 'integer', minimum: 1, maximum: 10 },
    }),
  },
  exclusions: {
    type: 'array',
    maxItems: 8,
    items: strictObject({
      id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
      elementKey: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
      paddingRatio: { type: 'number', minimum: 0, maximum: 0.12 },
      protectedGroupIds: {
        type: 'array',
        maxItems: 12,
        items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
      },
    }),
  },
});

export function validateCreativeComposition(
  request: PosterCreativeComposeRequest,
  composition: PosterCreativeComposition,
): PosterCreativeComposition | null {
  if (composition.mode !== request.mode) return null;
  const elementKeys = new Set(composition.plan.elements.map((element) => element.key));
  const groups = composition.groups
    .map((group) => ({
      ...group,
      elementKeys: Array.from(new Set(group.elementKeys.filter((key) => elementKeys.has(key)))),
    }))
    .filter((group) => group.elementKeys.length > 0);
  if (groups.length === 0) return null;
  const groupIds = new Set(groups.map((group) => group.id));
  const exclusions = composition.exclusions.filter(
    (zone) =>
      elementKeys.has(zone.elementKey) &&
      zone.protectedGroupIds.every((groupId) => groupIds.has(groupId)),
  );
  const skillsUsed = Array.from(new Set(composition.skillsUsed));
  return PosterCreativeCompositionSchema.parse({
    ...composition,
    skillsUsed,
    groups,
    exclusions,
  });
}

export function creativePlanElement(
  input: Partial<PosterReconstructionPlan['elements'][number]> &
    Pick<PosterReconstructionPlan['elements'][number], 'key' | 'kind' | 'label' | 'box' | 'zIndex'>,
): PosterReconstructionPlan['elements'][number] {
  return {
    angle: 0,
    opacity: 1,
    fill: '#ffffff',
    stroke: null,
    strokeWidthRatio: 0,
    text: '',
    fontFamily: 'inter',
    fontSizeRatio: 0.028,
    fontWeight: '500',
    fontStyle: 'normal',
    textAlign: 'left',
    charSpacing: 0,
    lineHeight: 1.1,
    visibleLineCount: 0,
    textEffect: 'flat',
    extrusionColor: null,
    cornerRadiusRatio: 0,
    cornerStyle: 'auto',
    pathPoints: [],
    pathClosed: false,
    pathTension: 0.28,
    imageRole: 'none',
    imageMask: 'none',
    imageHasOverlays: false,
    replacementRecommended: false,
    replacementReason: '',
    imageSearchQuery: '',
    imageDominantColor: null,
    iconName: 'none',
    suggestedFieldKey: null,
    suggestedFieldLabel: '',
    confidence: 0.8,
    ...input,
  };
}
