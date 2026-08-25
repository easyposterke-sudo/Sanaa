import { z } from 'zod';

export const PosterTemplateCategoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const PosterTemplateCategoryInputSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    key: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(100),
    label: z.string().trim().min(1).max(100),
    kind: z.enum(['text', 'image']),
    hint: z.string().trim().max(180).optional(),
  })
  .strict();

export const PosterTemplateCategoryDefinitionSchema = z
  .object({
    id: PosterTemplateCategoryIdSchema,
    name: z.string().trim().min(1).max(80),
    inputs: z.array(PosterTemplateCategoryInputSchema).max(30),
    canEdit: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

export const CreatePosterTemplateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    inputs: z.array(PosterTemplateCategoryInputSchema).max(30).default([]),
  })
  .strict();

export const UpdatePosterTemplateCategorySchema = CreatePosterTemplateCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one category change.');

export type PosterTemplateCategoryInput = z.infer<typeof PosterTemplateCategoryInputSchema>;
export type PosterTemplateCategoryDefinition = z.infer<typeof PosterTemplateCategoryDefinitionSchema>;
