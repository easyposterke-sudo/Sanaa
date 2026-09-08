import { z } from 'zod';
import { POSTER_RECONSTRUCTION_JSON_SCHEMA, PosterReconstructionPlanSchema, ReconstructionElementSchema, type PosterReconstructionPlan } from './posterReconstruction';

/** Review returns only changed/new layers; unchanged editable content stays intact. */
export const PosterCreationPatchSchema = z.object({
  summary: z.string().min(1).max(500),
  upsert: z.array(ReconstructionElementSchema).max(45),
  removeKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,47}$/)).max(45),
  canvas: PosterReconstructionPlanSchema.shape.canvas.nullable(),
}).strict();

export const POSTER_CREATION_PATCH_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'upsert', 'removeKeys', 'canvas'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    upsert: POSTER_RECONSTRUCTION_JSON_SCHEMA.properties.elements,
    removeKeys: { type: 'array', maxItems: 45, items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,47}$' } },
    canvas: { anyOf: [POSTER_RECONSTRUCTION_JSON_SCHEMA.properties.canvas, { type: 'null' }] },
  },
};

export function applyPosterCreationPatch(previous: PosterReconstructionPlan, value: unknown): PosterReconstructionPlan {
  const patch = PosterCreationPatchSchema.parse(value);
  const existing = new Map(previous.elements.map(element => [element.key, element]));
  const updates = new Set(patch.upsert.map(element => element.key));
  if (existing.size !== previous.elements.length || updates.size !== patch.upsert.length) throw new Error('Duplicate layer keys.');
  for (const key of patch.removeKeys) {
    if (!existing.has(key) || updates.has(key)) throw new Error('Invalid layer removal.');
    if (existing.get(key)?.kind === 'image_region') throw new Error('Review cannot remove bound images.');
    existing.delete(key);
  }
  for (const element of patch.upsert) {
    const old = existing.get(element.key);
    if (old?.kind === 'image_region' && (element.kind !== old.kind || element.imageRole !== old.imageRole)) throw new Error('Review cannot change image identity.');
    existing.set(element.key, element);
  }
  return PosterReconstructionPlanSchema.parse({ ...previous, summary: patch.summary, canvas: patch.canvas ?? previous.canvas, elements: [...existing.values()] });
}
