import { z } from 'zod';
import {
  PosterReconstructionPlanSchema,
  ReconstructionBoxSchema,
  ReconstructionFontCatalogSchema,
  type PosterReconstructionPlan,
} from './posterReconstruction';

export const POSTER_ELEMENT_EDIT_PROMPT_VERSION =
  'poster-element-edit-v1-selected-layer-only' as const;

const ImageInputSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
}).strict();

export const PosterElementEditRequestSchema = z.object({
  reference: ImageInputSchema,
  currentDraft: ImageInputSchema,
  instruction: z.string().trim().min(3).max(1500),
  selected: z.object({
    id: z.string().min(1).max(160),
    type: z.enum([
      'image', 'text', '3d-text', 'rect', 'circle', 'triangle', 'ellipse',
      'line', 'polygon', 'path', 'magic-layer',
    ]),
    label: z.string().trim().min(1).max(180),
    box: ReconstructionBoxSchema,
    /** Sanitized JSON: data URLs and raster payloads are deliberately omitted. */
    propertiesJson: z.string().min(2).max(16_000),
  }).strict(),
  fontCatalog: ReconstructionFontCatalogSchema.optional(),
}).strict();

export type PosterElementEditRequest = z.infer<typeof PosterElementEditRequestSchema>;

export interface PosterElementEditResponse {
  patch: PosterReconstructionPlan;
  model: string;
  requestId: string;
}

export function parsePosterElementEditPatch(value: unknown): PosterReconstructionPlan {
  const patch = PosterReconstructionPlanSchema.parse(value);
  if (patch.elements.length < 1 || patch.elements.length > 8) {
    throw new Error('A selected-layer edit must return between 1 and 8 replacement elements.');
  }
  return patch;
}
