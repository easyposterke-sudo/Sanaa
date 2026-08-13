import type { PosterElement, PosterProject } from '../types';

export type PosterProjectPatch = {
  canvasWidth?: number;
  canvasHeight?: number;
  canvasBackground?: PosterProject['canvasBackground'];
  removeElementIds?: string[];
  upsertElements?: PosterElement[];
};

function stableStringify(x: unknown): string {
  return JSON.stringify(x);
}
export function computePosterProjectPatch(base: PosterProject, current: PosterProject): PosterProjectPatch {
  const patch: PosterProjectPatch = {};

  if (base.canvasWidth !== current.canvasWidth) patch.canvasWidth = current.canvasWidth;
  if (base.canvasHeight !== current.canvasHeight) patch.canvasHeight = current.canvasHeight;
  if (stableStringify(base.canvasBackground) !== stableStringify(current.canvasBackground)) {
    patch.canvasBackground = current.canvasBackground;
  }

  const baseById = new Map(base.elements.map((e) => [e.id, e]));
  const curById = new Map(current.elements.map((e) => [e.id, e]));

  const removed: string[] = [];
  for (const id of baseById.keys()) {
    if (!curById.has(id)) removed.push(id);
  }
  if (removed.length) patch.removeElementIds = removed;

  const upserts: PosterElement[] = [];
  for (const [id, el] of curById.entries()) {
    const prev = baseById.get(id);
    if (!prev) {
      upserts.push(el);
      continue;
    }
    if (stableStringify(prev) !== stableStringify(el)) {
      upserts.push(el);
    }
  }
  if (upserts.length) patch.upsertElements = upserts;

  return patch;
}

export function patchIsEmpty(patch: PosterProjectPatch): boolean {
  return !(
    patch.canvasWidth !== undefined ||
    patch.canvasHeight !== undefined ||
    patch.canvasBackground !== undefined ||
    (patch.removeElementIds?.length ?? 0) > 0 ||
    (patch.upsertElements?.length ?? 0) > 0
  );
}

