import { z } from 'zod';

export const TEMPLATE_POSTER_SCHEMA_VERSION = 1 as const;
export const TEMPLATE_POSTER_PROMPT_VERSION = 'template-poster-selector-v1' as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const TemplateCategorySchema = z.enum(['church', 'conference', 'business', 'event', 'general']);

export const TemplatePosterFieldSchema = z
  .object({
    key: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(100),
    label: z.string().trim().min(1).max(100),
    kind: z.enum(['text', 'image']),
  })
  .strict();

export const TemplatePosterCatalogItemSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(100),
    category: TemplateCategorySchema,
    description: z.string().trim().max(500),
    fields: z.array(TemplatePosterFieldSchema).max(80),
  })
  .strict();

export const TemplatePosterImageSchema = z
  .object({
    index: z.number().int().min(0).max(7),
    name: z.string().trim().max(100),
    role: z.string().trim().max(100),
  })
  .strict();

export const TemplatePosterRequestSchema = z
  .object({
    brief: z.string().trim().min(10).max(4_000),
    themeColor: HexColorSchema.nullable(),
    images: z.array(TemplatePosterImageSchema).max(8),
    templates: z.array(TemplatePosterCatalogItemSchema).min(1).max(100),
    excludedTemplateIds: z.array(z.string().trim().min(1).max(200)).max(100),
  })
  .strict();

export type TemplatePosterRequest = z.infer<typeof TemplatePosterRequestSchema>;
export type TemplatePosterCatalogItem = z.infer<typeof TemplatePosterCatalogItemSchema>;

export const TemplatePosterFieldValueSchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    value: z.string().max(500).nullable(),
    imageIndex: z.number().int().min(0).max(7).nullable(),
  })
  .strict();

export const TemplatePosterSelectionSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_POSTER_SCHEMA_VERSION),
    templateId: z.string().trim().min(1).max(200),
    fields: z.array(TemplatePosterFieldValueSchema).max(80),
  })
  .strict();

export type TemplatePosterSelection = z.infer<typeof TemplatePosterSelectionSchema>;
export type TemplatePosterSource = 'openai' | 'fallback';

export interface TemplatePosterResponse {
  selection: TemplatePosterSelection;
  source: TemplatePosterSource;
  model: string | null;
  requestId: string;
}

export const TEMPLATE_POSTER_SELECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'templateId', 'fields'],
  properties: {
    schemaVersion: { type: 'integer', const: TEMPLATE_POSTER_SCHEMA_VERSION },
    templateId: { type: 'string', minLength: 1, maxLength: 200 },
    fields: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'imageIndex'],
        properties: {
          key: { type: 'string', minLength: 1, maxLength: 100 },
          value: { type: ['string', 'null'], maxLength: 500 },
          imageIndex: { type: ['integer', 'null'], minimum: 0, maximum: 7 },
        },
      },
    },
  },
} as const;

export function validateTemplatePosterSelection(
  request: TemplatePosterRequest,
  selection: TemplatePosterSelection,
): TemplatePosterSelection | null {
  const template = request.templates.find((item) => item.id === selection.templateId);
  if (!template) return null;

  const alternatives = request.templates.filter(
    (item) => !request.excludedTemplateIds.includes(item.id),
  );
  if (
    alternatives.length > 0 &&
    request.excludedTemplateIds.includes(selection.templateId)
  ) {
    return null;
  }

  const fieldsByKey = new Map(template.fields.map((field) => [field.key, field]));
  const validImageIndexes = new Set(request.images.map((image) => image.index));
  const seen = new Set<string>();
  const fields = selection.fields.filter((fieldValue) => {
    const field = fieldsByKey.get(fieldValue.key);
    if (!field || seen.has(fieldValue.key)) return false;
    if (field.kind === 'text' && fieldValue.imageIndex !== null) return false;
    if (
      field.kind === 'image' &&
      fieldValue.imageIndex !== null &&
      !validImageIndexes.has(fieldValue.imageIndex)
    ) {
      return false;
    }
    seen.add(fieldValue.key);
    return true;
  });

  return { ...selection, fields };
}

export function createFallbackTemplatePosterSelection(
  request: TemplatePosterRequest,
): TemplatePosterSelection {
  const available = request.templates.filter(
    (template) => !request.excludedTemplateIds.includes(template.id),
  );
  const candidates = available.length > 0 ? available : request.templates;
  const template = [...candidates].sort(
    (left, right) => scoreTemplate(request, right) - scoreTemplate(request, left),
  )[0];
  if (!template) throw new Error('At least one poster template is required.');
  let imageSlotIndex = 0;

  return {
    schemaVersion: TEMPLATE_POSTER_SCHEMA_VERSION,
    templateId: template.id,
    fields: template.fields.map((field) => {
      if (field.kind === 'image') {
        const image = request.images[imageSlotIndex % Math.max(1, request.images.length)];
        imageSlotIndex += 1;
        return { key: field.key, value: null, imageIndex: image?.index ?? null };
      }
      return {
        key: field.key,
        value: fallbackTextValue(field.key, field.label, request),
        imageIndex: null,
      };
    }),
  };
}

function scoreTemplate(request: TemplatePosterRequest, template: TemplatePosterCatalogItem): number {
  const briefWords = tokenize(request.brief);
  const searchable = tokenize(
    [template.name, template.category, template.description, ...template.fields.flatMap((f) => [f.key, f.label])]
      .join(' '),
  );
  let score = 0;
  for (const word of briefWords) if (searchable.has(word)) score += 3;

  if (/church|worship|sunday|service|pastor|scripture|verse|ministry/i.test(request.brief)) {
    if (template.category === 'church') score += 18;
  }
  if (/conference|seminar|summit|workshop|convention/i.test(request.brief)) {
    if (template.category === 'conference') score += 18;
  }
  if (/business|company|sale|product|brand|corporate/i.test(request.brief)) {
    if (template.category === 'business') score += 18;
  }

  const imageSlots = template.fields.filter((field) => field.kind === 'image').length;
  const imageDifference = Math.abs(imageSlots - request.images.length);
  score += Math.max(0, 20 - imageDifference * 8);
  if (request.images.length > 0 && imageSlots === 0) score -= 24;
  if (request.images.length === 0 && imageSlots > 0) score -= imageSlots * 5;
  return score;
}

function fallbackTextValue(
  key: string,
  label: string,
  request: TemplatePosterRequest,
): string {
  const hint = `${key} ${label}`.toLowerCase();
  if (/host|organizer|pastor/.test(hint)) {
    return request.images.find((image) => /host|pastor|organizer/i.test(image.role))?.name ??
      extractLabeledValue(request.brief, /(?:hosted by|host|organizer)\s*:?\s*([^\n.,;]+)/i);
  }
  if (/guest|speaker|minister|person/.test(hint)) {
    return request.images.find((image) => !/host|organizer/i.test(image.role))?.name ??
      extractLabeledValue(request.brief, /(?:guest(?:\s+(?:minister|speaker))?|featuring)\s*:?\s*([^\n.,;]+)/i);
  }
  if (/date|time|when/.test(hint)) {
    const labeled = extractLabeledValue(request.brief, /(?:date|time|when)\s*[:-]?\s*([^\n.]+)/i);
    if (labeled) return labeled;
    const date = extractLabeledValue(
      request.brief,
      /\bon\s+([^\n.,;]+?)(?=\s+(?:at|venue|location|theme|scripture|hosted|with)\b|[\n.,;]|$)/i,
    );
    const time = request.brief.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i)?.[1] ?? '';
    return [date, time].filter(Boolean).join(' at ');
  }
  if (/venue|location|where/.test(hint)) return extractLabeledValue(request.brief, /(?:venue|location|where)\s*[:-]?\s*([^\n.]+)/i);
  if (/tag|sub|description|details/.test(hint)) return deriveEventKind(request.brief);
  const keyHint = key.toLowerCase();
  if (/theme|motto/.test(keyHint)) return extractLabeledValue(request.brief, /(?:theme|motto)\s*[:-]?\s*([^\n.]+)/i);
  if (/verse|scripture/.test(keyHint)) return extractLabeledValue(request.brief, /(?:verse|scripture)\s*[:-]?\s*([^\n.]+)/i);
  if (/theme|motto/.test(hint)) return extractLabeledValue(request.brief, /(?:theme|motto)\s*[:-]?\s*([^\n.]+)/i);
  if (/verse|scripture/.test(hint)) return extractLabeledValue(request.brief, /(?:verse|scripture)\s*[:-]?\s*([^\n.]+)/i);
  if (/\b(?:title|headline|event)\b/.test(hint)) return deriveTitle(request.brief);
  return '';
}

function extractLabeledValue(text: string, pattern: RegExp): string {
  return truncate(text.match(pattern)?.[1]?.trim() ?? '', 180);
}

function deriveTitle(brief: string): string {
  const named = brief.match(
    /\b(?:called|titled|named)\s+["“']?(.+?)["”']?(?=\s+(?:on|at|taking|scheduled|for)\b|[.,;\n]|$)/i,
  )?.[1];
  if (named) return truncate(named, 100);
  const labeled = brief.match(/(?:title|event|poster)\s*[:-]?\s*([^\n.]+)/i)?.[1];
  const firstSentence = brief.split(/[.\n]/).map((part) => part.trim()).find(Boolean) ?? brief;
  return truncate(labeled?.trim() || firstSentence, 100);
}

function deriveEventKind(brief: string): string {
  const match = brief.match(
    /\b(?:create|make|design)(?:\s+(?:a|an|the))?\s+(.+?)(?=\s+(?:called|titled|named|on|at|for)\b|[.,;\n]|$)/i,
  )?.[1];
  return truncate(match ?? '', 100);
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );
}
