import { z } from 'zod';
import {
  TemplatePosterCatalogItemSchema,
  TemplatePosterFieldValueSchema,
  TemplatePosterImageSchema,
  TemplatePosterSemanticRoleSchema,
  detectProvidedMajorTemplateFacts,
  type TemplatePosterSemanticRole,
} from './templatePoster';

export const POSTER_DESIGNER_AGENT_SCHEMA_VERSION = 1 as const;
export const POSTER_DESIGNER_AGENT_PROMPT_VERSION = 'poster-designer-agent-v2' as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const NormalizedAgentBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.03).max(1),
    height: z.number().min(0.02).max(1),
  })
  .strict();

export type NormalizedAgentBox = z.infer<typeof NormalizedAgentBoxSchema>;

export const PosterDesignerOperationKindSchema = z.enum([
  'add_text',
  'add_panel',
  'move_resize',
  'update_text_style',
  'hide_duplicate_text',
  'bring_to_front',
]);

/**
 * A deliberately small browser-executed tool protocol. Nullable fields keep the
 * structured-output schema simple; trusted client code validates each operation
 * again before touching the poster document.
 */
export const PosterDesignerOperationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    kind: PosterDesignerOperationKindSchema,
    elementId: z.string().trim().min(1).max(120).nullable(),
    semanticRole: TemplatePosterSemanticRoleSchema.nullable(),
    text: z.string().max(500).nullable(),
    box: NormalizedAgentBoxSchema.nullable(),
    fontFamily: z.enum(['Inter', 'Arial', 'Arial Black', 'Georgia', 'Impact', 'Montserrat', 'Poppins']).nullable(),
    fontSizeRatio: z.number().min(0.008).max(0.16).nullable(),
    fontWeight: z.enum(['400', '500', '600', '700', '800', '900']).nullable(),
    textAlign: z.enum(['left', 'center', 'right']).nullable(),
    fill: HexColorSchema.nullable(),
    fillOpacity: z.number().min(0.08).max(1).nullable().default(null),
    cornerRadiusRatio: z.number().min(0).max(0.5).nullable().default(null),
    reason: z.string().trim().min(1).max(180),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.kind === 'add_text') {
      if (!operation.text?.trim()) {
        context.addIssue({ code: 'custom', message: 'add_text requires text.', path: ['text'] });
      }
      if (!operation.box) {
        context.addIssue({ code: 'custom', message: 'add_text requires a box.', path: ['box'] });
      }
    } else if (operation.kind === 'add_panel') {
      if (!operation.box || !operation.fill) {
        context.addIssue({ code: 'custom', message: 'add_panel requires a box and fill.', path: ['box'] });
      }
    } else if (!operation.elementId) {
      context.addIssue({ code: 'custom', message: `${operation.kind} requires elementId.`, path: ['elementId'] });
    }
  });

export type PosterDesignerOperation = z.infer<typeof PosterDesignerOperationSchema>;

export const PosterDesignerStartRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    brief: z.string().trim().min(10).max(4_000),
    categoryId: z.string().trim().min(1).max(80).nullable(),
    themeColor: HexColorSchema.nullable(),
    images: z.array(TemplatePosterImageSchema).max(8),
    templates: z.array(TemplatePosterCatalogItemSchema).min(1).max(100),
    excludedTemplateIds: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
    maxRevisions: z.number().int().min(0).max(3).default(1),
  })
  .strict();

export type PosterDesignerStartRequest = z.infer<typeof PosterDesignerStartRequestSchema>;
export type PosterDesignerStartRequestInput = z.input<typeof PosterDesignerStartRequestSchema>;

export const PosterDesignerPlanSchema = z
  .object({
    schemaVersion: z.literal(POSTER_DESIGNER_AGENT_SCHEMA_VERSION),
    templateId: z.string().trim().min(1).max(200),
    mode: z.enum(['strict', 'adaptive']),
    concept: z.string().trim().min(1).max(300),
    fields: z.array(TemplatePosterFieldValueSchema).max(80),
    operations: z.array(PosterDesignerOperationSchema).max(20),
    expectedFacts: z.array(TemplatePosterSemanticRoleSchema).max(16),
  })
  .strict();

export type PosterDesignerPlan = z.infer<typeof PosterDesignerPlanSchema>;

export const PosterDesignerElementSummarySchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(40),
    semanticRole: TemplatePosterSemanticRoleSchema.nullable(),
    text: z.string().max(500).nullable(),
    box: NormalizedAgentBoxSchema,
    fontSizeRatio: z.number().min(0).max(1).nullable(),
    fill: z.string().max(80).nullable(),
    zIndex: z.number().int(),
    agentCreated: z.boolean(),
    locked: z.boolean(),
  })
  .strict();

export type PosterDesignerElementSummary = z.infer<typeof PosterDesignerElementSummarySchema>;

export const PosterDesignerValidationIssueSchema = z
  .object({
    code: z.enum([
      'out_of_bounds',
      'text_too_small',
      'text_overlap',
      'duplicate_text',
      'duplicate_semantic_role',
      'missing_fact',
      'low_contrast',
      'weak_hierarchy',
      'crowded_spacing',
    ]),
    severity: z.enum(['warning', 'error']),
    elementIds: z.array(z.string().trim().min(1).max(120)).max(8),
    message: z.string().trim().min(1).max(240),
  })
  .strict();

export type PosterDesignerValidationIssue = z.infer<typeof PosterDesignerValidationIssueSchema>;

export const PosterDesignerReviewRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    iteration: z.number().int().min(1).max(3),
    elements: z.array(PosterDesignerElementSummarySchema).max(120),
    issues: z.array(PosterDesignerValidationIssueSchema).max(80),
    preview: z
      .object({
        dataUrl: z.string().startsWith('data:image/webp;base64,').max(1_500_000),
        width: z.number().int().min(64).max(800),
        height: z.number().int().min(64).max(1600),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type PosterDesignerReviewRequest = z.infer<typeof PosterDesignerReviewRequestSchema>;

export const PosterDesignerReviewSchema = z
  .object({
    schemaVersion: z.literal(POSTER_DESIGNER_AGENT_SCHEMA_VERSION),
    score: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1).max(400),
    stopReason: z.enum(['quality_passed', 'revision_recommended', 'revision_limit']),
    operations: z.array(PosterDesignerOperationSchema).max(16),
  })
  .strict();

export type PosterDesignerReview = z.infer<typeof PosterDesignerReviewSchema>;

export type PosterDesignerSource = 'openai' | 'fallback';

export interface PosterDesignerStartResponse {
  plan: PosterDesignerPlan;
  source: PosterDesignerSource;
  model: string | null;
  requestId: string;
}

export interface PosterDesignerReviewResponse {
  review: PosterDesignerReview;
  source: PosterDesignerSource;
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

const nullableString = (maxLength: number): JsonSchema => ({
  type: ['string', 'null'],
  maxLength,
});

const normalizedBoxJsonSchema = strictObject({
  x: { type: 'number', minimum: 0, maximum: 1 },
  y: { type: 'number', minimum: 0, maximum: 1 },
  width: { type: 'number', minimum: 0.03, maximum: 1 },
  height: { type: 'number', minimum: 0.02, maximum: 1 },
});

const operationJsonSchema = strictObject({
  id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' },
  kind: {
    type: 'string',
    enum: [
      'add_text',
      'add_panel',
      'move_resize',
      'update_text_style',
      'hide_duplicate_text',
      'bring_to_front',
    ],
  },
  elementId: nullableString(120),
  semanticRole: {
    type: ['string', 'null'],
    enum: [...TemplatePosterSemanticRoleSchema.options, null],
  },
  text: nullableString(500),
  box: { anyOf: [normalizedBoxJsonSchema, { type: 'null' }] },
  fontFamily: {
    type: ['string', 'null'],
    enum: ['Inter', 'Arial', 'Arial Black', 'Georgia', 'Impact', 'Montserrat', 'Poppins', null],
  },
  fontSizeRatio: { type: ['number', 'null'], minimum: 0.008, maximum: 0.16 },
  fontWeight: { type: ['string', 'null'], enum: ['400', '500', '600', '700', '800', '900', null] },
  textAlign: { type: ['string', 'null'], enum: ['left', 'center', 'right', null] },
  fill: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' },
  fillOpacity: { type: ['number', 'null'], minimum: 0.08, maximum: 1 },
  cornerRadiusRatio: { type: ['number', 'null'], minimum: 0, maximum: 0.5 },
  reason: { type: 'string', minLength: 1, maxLength: 180 },
});

const fieldValueJsonSchema = strictObject({
  key: { type: 'string', minLength: 1, maxLength: 100 },
  value: nullableString(500),
  imageIndex: { type: ['integer', 'null'], minimum: 0, maximum: 7 },
});

export function posterDesignerPlanJsonSchema(templateIds: readonly string[]): JsonSchema {
  return strictObject({
    schemaVersion: { type: 'integer', const: POSTER_DESIGNER_AGENT_SCHEMA_VERSION },
    templateId: { type: 'string', enum: [...new Set(templateIds)] },
    mode: { type: 'string', enum: ['strict', 'adaptive'] },
    concept: { type: 'string', minLength: 1, maxLength: 300 },
    fields: { type: 'array', maxItems: 80, items: fieldValueJsonSchema },
    operations: { type: 'array', maxItems: 20, items: operationJsonSchema },
    expectedFacts: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', enum: [...TemplatePosterSemanticRoleSchema.options] },
    },
  });
}

export const POSTER_DESIGNER_REVIEW_JSON_SCHEMA = strictObject({
  schemaVersion: { type: 'integer', const: POSTER_DESIGNER_AGENT_SCHEMA_VERSION },
  score: { type: 'integer', minimum: 0, maximum: 100 },
  summary: { type: 'string', minLength: 1, maxLength: 400 },
  stopReason: {
    type: 'string',
    enum: ['quality_passed', 'revision_recommended', 'revision_limit'],
  },
  operations: { type: 'array', maxItems: 16, items: operationJsonSchema },
});

export function validatePosterDesignerPlan(
  request: PosterDesignerStartRequest,
  plan: PosterDesignerPlan,
): PosterDesignerPlan | null {
  const template = request.templates.find((candidate) => candidate.id === plan.templateId);
  if (!template) return null;
  const fields = new Map(template.fields.map((field) => [field.key, field]));
  const seen = new Set<string>();
  const safeFields = plan.fields.filter((field) => {
    if (seen.has(field.key)) return false;
    const definition = fields.get(field.key);
    if (!definition) return false;
    if (field.imageIndex !== null && definition.kind !== 'image') return false;
    if (field.value !== null && definition.kind !== 'text') return false;
    if (field.imageIndex !== null && field.imageIndex >= request.images.length) return false;
    seen.add(field.key);
    return true;
  });
  const expectedFacts = Array.from(new Set([
    ...detectProvidedMajorTemplateFacts(request.brief),
    ...plan.expectedFacts,
  ])).slice(0, 16);
  const filledRoles = new Set<TemplatePosterSemanticRole>();
  const filledCopy = new Set<string>();
  for (const value of safeFields) {
    if (!value.value?.trim()) continue;
    const field = fields.get(value.key);
    if (!field) continue;
    filledRoles.add(field.semanticRole);
    for (const role of field.supportedFacts) filledRoles.add(role);
    filledCopy.add(normalizePosterCopy(value.value));
  }
  const operations = plan.operations.filter((operation) => {
    if (operation.kind !== 'add_text') return true;
    const copy = normalizePosterCopy(operation.text ?? '');
    if (copy && filledCopy.has(copy)) return false;
    return !operation.semanticRole || !filledRoles.has(operation.semanticRole);
  });
  return { ...plan, fields: safeFields, operations, expectedFacts };
}

export function validatePosterDesignerReview(
  request: PosterDesignerReviewRequest,
  review: PosterDesignerReview,
): PosterDesignerReview {
  const elementIds = new Set(request.elements.map((element) => element.id));
  return {
    ...review,
    operations: review.operations.filter(
      (operation) =>
        operation.kind === 'add_text' ||
        (operation.kind === 'add_panel' && (!operation.elementId || elementIds.has(operation.elementId))) ||
        Boolean(operation.elementId && elementIds.has(operation.elementId)),
    ),
  };
}

function normalizePosterCopy(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
