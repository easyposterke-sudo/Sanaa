import { z } from 'zod';
import { PosterTemplateCategoryIdSchema } from '../../shared/poster/templateCategory';

export const posterTemplateCategorySchema = PosterTemplateCategoryIdSchema;

const fieldBindingSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(100),
  label: z.string().trim().min(1).max(100),
  sourceElementId: z.string().trim().min(1).max(200),
  kind: z.enum(['text', 'image']).optional(),
});

const posterElementSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(50),
  })
  .passthrough();

const posterProjectSchema = z
  .object({
    elements: z.array(posterElementSchema).max(10_000),
    canvasWidth: z.number().finite().positive().max(32_768),
    canvasHeight: z.number().finite().positive().max(32_768),
    canvasBackgroundColor: z.string().max(200).optional(),
    canvasBackground: z.unknown().optional(),
  })
  .passthrough();

const templateMetadataSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: posterTemplateCategorySchema,
  description: z.string().trim().max(500).optional(),
  fields: z.array(fieldBindingSchema).max(500).optional(),
});

export const createPosterTemplateSchema = templateMetadataSchema.extend({
  templateId: z.string().trim().max(200).optional(),
  project: posterProjectSchema,
  thumbnail: z.string().max(5_000_000).optional(),
});

export const updatePosterTemplateSchema = templateMetadataSchema
  .partial()
  .extend({
    project: posterProjectSchema.optional(),
    thumbnail: z.string().max(5_000_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one template change.');

export const storedPosterTemplateSchema = templateMetadataSchema.extend({
  id: z.string().min(1),
  project: posterProjectSchema,
});

export type StoredPosterTemplate = z.infer<typeof storedPosterTemplateSchema>;

export function validateTemplateFieldSources(template: StoredPosterTemplate): boolean {
  if (!template.fields) return true;
  const elementIds = new Set(template.project.elements.map((element) => element.id));
  return template.fields.every((field) => elementIds.has(field.sourceElementId));
}

export function parsePosterTemplateThumbnail(
  value: string | undefined,
): { mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: Uint8Array } | null {
  if (!value) return null;
  const match = value.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  const mediaType = match?.[1];
  const encoded = match?.[2];
  if (
    (mediaType !== 'image/png' && mediaType !== 'image/jpeg' && mediaType !== 'image/webp') ||
    !encoded
  ) {
    return null;
  }

  try {
    const binary = atob(encoded.replace(/[\r\n]/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!matchesImageSignature(mediaType, bytes)) return null;
    return { mediaType, bytes };
  } catch {
    return null;
  }
}

function matchesImageSignature(mediaType: string, bytes: Uint8Array): boolean {
  if (mediaType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (mediaType === 'image/jpeg') {
    return (
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}
