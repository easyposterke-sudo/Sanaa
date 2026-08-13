import { getBundledPosterTemplates } from './templates/bundled';
import type { PosterTemplateCategory } from './templateTypes';
import type { PosterTemplateDefinition } from './templateTypes';
import { loadUserPosterTemplates } from './userTemplatesStorage';
import { usePosterStore } from './store/posterStore';

/** Bundled → localStorage → cloud; first wins on duplicate `id`. */
function mergeTemplatesById(...lists: PosterTemplateDefinition[][]): PosterTemplateDefinition[] {
  const seen = new Set<string>();
  const out: PosterTemplateDefinition[] = [];
  for (const list of lists) {
    for (const t of list) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function getAllPosterTemplates(): PosterTemplateDefinition[] {
  return mergeTemplatesById(
    getBundledPosterTemplates(),
    loadUserPosterTemplates(),
    usePosterStore.getState().remotePosterTemplates
  );
}

/**
 * Templates for a category. `general` includes every template; empty category lists fall back to all.
 */
export function getPosterTemplatesForCategory(category: PosterTemplateCategory): PosterTemplateDefinition[] {
  const all = getAllPosterTemplates();
  if (category === 'general') return all;
  const matched = all.filter((t) => t.category === category);
  return matched.length > 0 ? matched : all;
}

export function findPosterTemplateById(id: string): PosterTemplateDefinition | undefined {
  return getAllPosterTemplates().find((t) => t.id === id);
}
