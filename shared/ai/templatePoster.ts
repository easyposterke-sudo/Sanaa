import { z } from 'zod';
import { PosterTemplateCategoryIdSchema } from '../poster/templateCategory';

export const TEMPLATE_POSTER_SCHEMA_VERSION = 1 as const;
export const TEMPLATE_POSTER_PROMPT_VERSION = 'template-poster-selector-v3' as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const TemplateCategorySchema = PosterTemplateCategoryIdSchema;
export const TemplatePosterSemanticRoleSchema = z.enum([
  'title',
  'tagline',
  'organization',
  'person_name',
  'date',
  'day',
  'time',
  'venue',
  'contact',
  'phone',
  'website',
  'email',
  'theme',
  'extra_details',
  'other',
]);

export type TemplatePosterSemanticRole = z.infer<typeof TemplatePosterSemanticRoleSchema>;

export const TemplatePosterExistingTextSchema = z
  .object({
    elementId: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(500),
    semanticRole: TemplatePosterSemanticRoleSchema.nullable(),
    labeled: z.boolean(),
    fontSizeRatio: z.number().min(0).max(1).nullable(),
    box: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0.01).max(1),
        height: z.number().min(0.01).max(1),
      })
      .strict(),
  })
  .strict();

export type TemplatePosterExistingText = z.infer<typeof TemplatePosterExistingTextSchema>;

export const TemplatePosterFieldSchema = z
  .object({
    key: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(100),
    label: z.string().trim().min(1).max(100),
    kind: z.enum(['text', 'image']),
    semanticRole: TemplatePosterSemanticRoleSchema.default('other'),
    supportedFacts: z.array(TemplatePosterSemanticRoleSchema).max(12).default([]),
    sampleText: z.string().max(500).default(''),
    maxWords: z.number().int().min(1).max(100).nullable().default(null),
    maxCharacters: z.number().int().min(1).max(500).nullable().default(null),
    maxLines: z.number().int().min(1).max(20).nullable().default(null),
    optional: z.boolean().default(false),
  })
  .strict();

export const TemplatePosterCatalogItemSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(100),
    category: TemplateCategorySchema,
    description: z.string().trim().max(500),
    fields: z.array(TemplatePosterFieldSchema).max(80),
    /** Visible copy is inventoried even when the template creator did not label it as a fillable field. */
    existingText: z.array(TemplatePosterExistingTextSchema).max(120).optional(),
    /** Optional small trusted gallery rendering so the designer can judge the layout, not only field names. */
    preview: z
      .object({
        dataUrl: z.string().startsWith('data:image/').max(300_000),
        width: z.number().int().min(64).max(800),
        height: z.number().int().min(64).max(1_600),
      })
      .strict()
      .nullable()
      .optional(),
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
export type TemplatePosterRequestInput = z.input<typeof TemplatePosterRequestSchema>;
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

export const TEMPLATE_POSTER_MAJOR_FACT_ROLES = [
  'organization',
  'person_name',
  'date',
  'day',
  'time',
  'venue',
  'contact',
  'phone',
  'website',
  'email',
  'theme',
] as const satisfies readonly TemplatePosterSemanticRole[];

export type TemplatePosterMajorFactRole = (typeof TEMPLATE_POSTER_MAJOR_FACT_ROLES)[number];

export function isTemplatePosterMajorFactRole(
  role: TemplatePosterSemanticRole,
): role is TemplatePosterMajorFactRole {
  return (TEMPLATE_POSTER_MAJOR_FACT_ROLES as readonly TemplatePosterSemanticRole[]).includes(role);
}

export function detectProvidedMajorTemplateFacts(brief: string): TemplatePosterMajorFactRole[] {
  const facts = new Set<TemplatePosterMajorFactRole>();
  const add = (fact: TemplatePosterMajorFactRole, matches: boolean) => {
    if (matches) facts.add(fact);
  };

  add(
    'organization',
    /\b(?:church|ministry|organization|organisation|company|brand)\s*(?:name)?\s*(?::|-|is)\s*\S|\b(?:hosted|organized|organised|presented)\s+by\s+\S/i.test(brief) ||
      /\b(?:[A-Z][\p{L}'’.-]*\s+){1,6}(?:Church|Chapel|Ministr(?:y|ies)|Fellowship)\b/u.test(brief),
  );
  add(
    'person_name',
    /\b(?:pastor|pst\.?|preacher|speaker|guest|minister|presenter|host)\s*(?::|-|is)?\s+[A-Z][\p{L}'’.-]+/u.test(brief),
  );
  add(
    'theme',
    /\b(?:theme|motto|scripture|verse)\s*(?::|-|is)\s*["“']?\S/i.test(brief),
  );
  add(
    'venue',
    /\b(?:venue|location|address)\s*(?::|-|is)\s*\S|\b(?:held|happening|located|taking\s+place)\s+at\s+\S/i.test(brief),
  );

  const hasPhone = /\b(?:phone|telephone|tel\.?|mobile|call|whatsapp)\b\s*(?::|-)?\s*\+?[\d(]/i.test(brief) ||
    /(?:\+\d[\d\s().-]{7,}\d|\b0\d{8,14}\b)/.test(brief);
  const hasWebsite = /\b(?:website|web\s*site|url)\s*(?::|-|is)?\s*(?:https?:\/\/|www\.|[\w-]+\.)/i.test(brief) ||
    /\b(?:https?:\/\/|www\.)\S+/i.test(brief) ||
    /\b[\w-]+\.(?:com|org|net|co|io|church|africa|ke|uk|us)(?:\/\S*)?\b/i.test(brief);
  const hasEmail = /\bemail\s*(?::|-|is)?\s*[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(brief) ||
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(brief);
  add('phone', hasPhone);
  add('website', hasWebsite);
  add('email', hasEmail);
  add(
    'contact',
    !hasPhone && !hasWebsite && !hasEmail && /\bcontact(?:\s+details?|\s+info(?:rmation)?)?\s*(?::|-|is)\s*\S/i.test(brief),
  );

  add(
    'time',
    /\b(?:time|starts?|starting|begins?|ending|finishes?)\s*(?::|-|is|at)\s*\d/i.test(brief) ||
      /\bat\s+\d{1,2}(?=\s|[.,;]|$)/i.test(brief) ||
      /\b\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(brief),
  );
  add(
    'day',
    /\bday\s*(?::|-|is)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(brief) ||
      /\b(?:on|every|this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i.test(brief),
  );
  add(
    'date',
    /\bdate\s*(?::|-|is)\s*\S/i.test(brief) ||
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(brief) ||
      /\b\d{1,2}(?:st|nd|rd|th)?[\s/-]+(?:\d{1,2}|[a-z]{3,9})[\s/-]+\d{2,4}\b/i.test(brief),
  );

  return TEMPLATE_POSTER_MAJOR_FACT_ROLES.filter((fact) => facts.has(fact));
}

export function getTemplatePosterFieldSupportedFacts(
  field: TemplatePosterCatalogItem['fields'][number],
): TemplatePosterSemanticRole[] {
  return field.supportedFacts.length > 0 ? field.supportedFacts : [field.semanticRole];
}

export function templateSupportsMajorTemplateFacts(
  template: TemplatePosterCatalogItem,
  requiredFacts: readonly TemplatePosterMajorFactRole[],
): boolean {
  const supported = new Set(
    template.fields
      .filter((field) => field.kind === 'text')
      .flatMap((field) => getTemplatePosterFieldSupportedFacts(field)),
  );
  return requiredFacts.every((fact) => {
    if (fact === 'day') return supported.has('day') || supported.has('date');
    if (fact === 'contact') {
      return ['contact', 'phone', 'website', 'email'].some((role) =>
        supported.has(role as TemplatePosterSemanticRole),
      );
    }
    if (fact === 'phone' || fact === 'website' || fact === 'email') {
      return supported.has(fact) || supported.has('contact');
    }
    return supported.has(fact);
  });
}

export function getSelectableTemplatePosterCatalog(
  request: TemplatePosterRequest,
): TemplatePosterCatalogItem[] {
  const available = request.templates.filter(
    (template) => !request.excludedTemplateIds.includes(template.id),
  );
  const candidates = available.length > 0 ? available : request.templates;
  const requiredFacts = detectProvidedMajorTemplateFacts(request.brief);
  return candidates.filter((template) =>
    templateSupportsMajorTemplateFacts(template, requiredFacts),
  );
}

export function validateTemplatePosterSelection(
  request: TemplatePosterRequest,
  selection: TemplatePosterSelection,
): TemplatePosterSelection | null {
  const template = request.templates.find((item) => item.id === selection.templateId);
  if (!template) return null;
  if (!templateSupportsMajorTemplateFacts(template, detectProvidedMajorTemplateFacts(request.brief))) {
    return null;
  }

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

  return constrainTemplatePosterSelection(request, { ...selection, fields });
}

export function createFallbackTemplatePosterSelection(
  request: TemplatePosterRequest,
): TemplatePosterSelection {
  const candidates = getSelectableTemplatePosterCatalog(request);
  const template = [...candidates].sort(
    (left, right) => scoreTemplate(request, right) - scoreTemplate(request, left),
  )[0];
  if (!template) throw new Error('At least one poster template is required.');
  let imageSlotIndex = 0;

  return constrainTemplatePosterSelection(request, {
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
  });
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

/**
 * Final guardrail for AI and fallback output. It keeps compact visual slots compact,
 * extracts one primary time from a service schedule, and moves overflow into the
 * template's designated extra-details field when one exists.
 */
export function constrainTemplatePosterSelection(
  request: TemplatePosterRequest,
  selection: TemplatePosterSelection,
): TemplatePosterSelection {
  const template = request.templates.find((item) => item.id === selection.templateId);
  if (!template) return selection;
  const fieldsByKey = new Map(template.fields.map((field) => [field.key, field]));
  const detailsField = template.fields.find(
    (field) => field.kind === 'text' && field.semanticRole === 'extra_details',
  );
  const overflow: string[] = [];
  const nextFields = selection.fields.map((fieldValue) => {
    const field = fieldsByKey.get(fieldValue.key);
    if (!field || field.kind !== 'text' || fieldValue.value === null) return fieldValue;
    const original = cleanFieldValue(fieldValue.value);
    if (!original || field.semanticRole === 'extra_details') {
      return { ...fieldValue, value: original };
    }

    if (!isSemanticallySuitable(field.semanticRole, original)) {
      overflow.push(`${field.label}: ${original}`);
      return { ...fieldValue, value: '' };
    }

    const fitted = fitFieldValue(field, original);
    if (fitted.overflow) overflow.push(fitted.overflow);
    return { ...fieldValue, value: fitted.value };
  });

  if (!detailsField || overflow.length === 0) return { ...selection, fields: nextFields };
  const detailsIndex = nextFields.findIndex((field) => field.key === detailsField.key);
  const existing = detailsIndex >= 0 ? cleanFieldValue(nextFields[detailsIndex]?.value ?? '') : '';
  const combined = uniqueDetailLines([existing, ...overflow]).join('\n');
  const fittedDetails = fitFieldValue(detailsField, combined).value;
  if (detailsIndex >= 0) {
    const currentDetails = nextFields[detailsIndex]!;
    nextFields[detailsIndex] = {
      ...currentDetails,
      value: fittedDetails,
      imageIndex: null,
    };
  } else if (nextFields.length < 80) {
    nextFields.push({ key: detailsField.key, value: fittedDetails, imageIndex: null });
  }
  return { ...selection, fields: nextFields };
}

function fitFieldValue(
  field: TemplatePosterCatalogItem['fields'][number],
  original: string,
): { value: string; overflow: string } {
  // Proper names are identity data, not expendable copy. Preserve the complete
  // organization/church name and every person's name even when the sample was
  // shorter. They must never be abbreviated or moved into extra details.
  if (
    field.semanticRole === 'organization' ||
    field.semanticRole === 'person_name' ||
    field.semanticRole === 'theme' ||
    field.semanticRole === 'venue' ||
    field.semanticRole === 'contact' ||
    field.semanticRole === 'phone' ||
    field.semanticRole === 'website' ||
    field.semanticRole === 'email'
  ) {
    return { value: original, overflow: '' };
  }

  if (field.semanticRole === 'time') {
    const schedule = extractServiceSchedule(original);
    if (schedule.primary) {
      return {
        value: formatTimeLikeSample(schedule.primary, field.sampleText),
        overflow: schedule.additional.join('\n'),
      };
    }
  }

  if (field.semanticRole === 'day') {
    const day = original.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[0];
    if (day) return { value: preserveSampleLineShape(day, field.sampleText), overflow: '' };
  }

  if (!exceedsFieldLimits(field, original)) {
    return { value: preserveSampleLineShape(original, field.sampleText), overflow: '' };
  }
  return {
    value: truncateToFieldLimits(original, field.maxWords, field.maxCharacters, field.maxLines),
    overflow: field.semanticRole === 'title' || isTemplatePosterMajorFactRole(field.semanticRole)
      ? ''
      : `${field.label}: ${original}`,
  };
}

function isSemanticallySuitable(role: TemplatePosterSemanticRole, value: string): boolean {
  const looksLikeSchedule = /\b(?:first|second|third|fourth)\s+service\b|\bstarts?\s+at\b|\b\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(value);
  if (
    looksLikeSchedule &&
    (role === 'title' || role === 'tagline' || role === 'organization' || role === 'person_name')
  ) {
    return false;
  }
  return true;
}

function extractServiceSchedule(value: string): { primary: string; additional: string[] } {
  const labeled = [...value.matchAll(
    /\b(first|second|third|fourth)\s+service\s*:?[\s-]*(?:starts?\s+(?:at\s+)?)?(\d{1,2}(?:(?::|\.)\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi,
  )];
  if (labeled.length > 0) {
    return {
      primary: normalizeTime(labeled[0]?.[2] ?? ''),
      additional: labeled.slice(1).map((match) =>
        `${capitalize(match[1] ?? 'Additional')} service: ${normalizeTime(match[2] ?? '')}`,
      ),
    };
  }

  const times = [...value.matchAll(
    /\b(\d{1,2}(?:(?::|\.)\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/gi,
  )].map((match) => normalizeTime(match[1] ?? ''));
  return {
    primary: times[0] ?? '',
    additional: times.slice(1).map((time) => `Additional service: ${time}`),
  };
}

function normalizeTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2})(?:(?::|\.)(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return cleanFieldValue(value);
  const hour = String(Number(match[1] ?? 0));
  const minute = match[2] ? `:${match[2]}` : '';
  const period = match[3]?.replace(/\./g, '').toUpperCase() ?? '';
  return `${hour}${minute}${period ? ` ${period}` : ''}`;
}

function formatTimeLikeSample(value: string, sample: string): string {
  const normalized = normalizeTime(value);
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return normalized;
  const separator = sample.includes('.') && !sample.includes(':') ? '.' : ':';
  const paddedHour = /(?:^|\n)0\d/.test(sample) ? (match[1] ?? '').padStart(2, '0') : match[1];
  const number = `${paddedHour}${match[2] ? `${separator}${match[2]}` : ''}`;
  const period = match[3]?.toUpperCase() ?? '';
  const sampleLines = sample.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const prefix = sampleLines.filter((line) => !/\d/.test(line) && /\b(?:time|start)\b/i.test(line));
  const splitNumberAndPeriod = sampleLines.length - prefix.length >= 2 && period !== '';
  const timeLines = splitNumberAndPeriod
    ? [number, period]
    : [`${number}${period ? ` ${period}` : ''}`];
  return [...prefix, ...timeLines].join(splitNumberAndPeriod || prefix.length > 0 ? '\n' : ' ');
}

function preserveSampleLineShape(value: string, sample: string): string {
  const sampleLines = sample.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (sampleLines.length <= 1 || value.includes('\n')) return value;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) return value;
  const result: string[] = [];
  let offset = 0;
  for (let index = 0; index < sampleLines.length && offset < words.length; index += 1) {
    const remainingLines = sampleLines.length - index;
    const take = Math.max(1, Math.ceil((words.length - offset) / remainingLines));
    result.push(words.slice(offset, offset + take).join(' '));
    offset += take;
  }
  return result.join('\n');
}

function exceedsFieldLimits(
  field: TemplatePosterCatalogItem['fields'][number],
  value: string,
): boolean {
  const words = value.split(/\s+/).filter(Boolean).length;
  const lines = value.split(/\r?\n/).length;
  return (
    (field.maxWords !== null && words > field.maxWords) ||
    (field.maxCharacters !== null && value.length > field.maxCharacters) ||
    (field.maxLines !== null && lines > field.maxLines)
  );
}

function truncateToFieldLimits(
  value: string,
  maxWords: number | null,
  maxCharacters: number | null,
  maxLines: number | null,
): string {
  let next = value
    .split(/\r?\n/)
    .slice(0, maxLines ?? Number.POSITIVE_INFINITY)
    .join('\n');
  if (maxWords !== null) next = next.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
  if (maxCharacters !== null && next.length > maxCharacters) {
    next = next.slice(0, maxCharacters).replace(/\s+\S*$/, '').trim();
  }
  return next.trim();
}

function cleanFieldValue(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);
}

function uniqueDetailLines(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    for (const line of cleanFieldValue(value).split('\n').filter(Boolean)) {
      const key = line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(line);
    }
  }
  return result;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ''}${value.slice(1).toLowerCase()}` : value;
}
