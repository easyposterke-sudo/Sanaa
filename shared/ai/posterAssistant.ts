import { z } from 'zod';

export const POSTER_ASSISTANT_PROMPT_VERSION = 'poster-assistant-v1' as const;

export const PosterTypographyMoodSchema = z.enum([
  'playful',
  'official',
  'crisp',
  'elegant',
  'bold',
  'modern',
]);

export const PosterAssistantRequestSchema = z
  .object({
    instruction: z.string().trim().min(3).max(1_000),
    brief: z.string().trim().min(10).max(4_000),
    currentThemeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  })
  .strict();

export const PosterAssistantActionSchema = z
  .object({
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    typographyMood: PosterTypographyMoodSchema.nullable(),
    chooseAnotherDesign: z.boolean(),
    reply: z.string().trim().min(1).max(300),
  })
  .strict();

export type PosterAssistantRequest = z.infer<typeof PosterAssistantRequestSchema>;
export type PosterAssistantAction = z.infer<typeof PosterAssistantActionSchema>;
export type PosterTypographyMood = z.infer<typeof PosterTypographyMoodSchema>;

export const POSTER_ASSISTANT_ACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['themeColor', 'typographyMood', 'chooseAnotherDesign', 'reply'],
  properties: {
    themeColor: {
      type: ['string', 'null'],
      pattern: '^#[0-9a-fA-F]{6}$',
    },
    typographyMood: {
      type: ['string', 'null'],
      enum: ['playful', 'official', 'crisp', 'elegant', 'bold', 'modern', null],
    },
    chooseAnotherDesign: { type: 'boolean' },
    reply: { type: 'string', minLength: 1, maxLength: 300 },
  },
} as const;

const NAMED_COLORS: Record<string, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  yellow: '#eab308',
  green: '#16a34a',
  emerald: '#059669',
  teal: '#0d9488',
  blue: '#2563eb',
  navy: '#1e3a8a',
  purple: '#7c3aed',
  violet: '#6d28d9',
  pink: '#db2777',
  black: '#18181b',
  gold: '#b8860b',
};

export function createFallbackPosterAssistantAction(
  request: PosterAssistantRequest,
): PosterAssistantAction {
  const instruction = request.instruction.toLowerCase();
  const hex = request.instruction.match(/#[0-9a-fA-F]{6}\b/)?.[0] ?? null;
  const namedColor = Object.entries(NAMED_COLORS).find(([name]) =>
    new RegExp(`\\b${name}\\b`, 'i').test(request.instruction),
  )?.[1];
  const asksForColor = /colou?r|theme|palette/.test(instruction);
  const themeColor = hex ?? namedColor ?? (asksForColor ? chooseBriefColor(request.brief) : null);
  const typographyMood = PosterTypographyMoodSchema.options.find((mood) =>
    new RegExp(`\\b${mood}\\b`, 'i').test(request.instruction),
  ) ?? (/font|type|title|text/.test(instruction) ? 'modern' : null);
  const chooseAnotherDesign =
    /another|different|new design|change (?:the )?(?:design|template)|try again/.test(instruction);
  const changed = Boolean(themeColor || typographyMood || chooseAnotherDesign);
  return {
    themeColor,
    typographyMood,
    chooseAnotherDesign,
    reply: changed
      ? 'I have prepared those poster changes.'
      : 'Ask me to change the theme color, typography style, or find another design.',
  };
}

function chooseBriefColor(brief: string): string {
  if (/church|worship|sunday|ministry/i.test(brief)) return '#6d28d9';
  if (/conference|business|corporate|official/i.test(brief)) return '#1d4ed8';
  if (/children|kids|playful|party/i.test(brief)) return '#db2777';
  return '#0d9488';
}
