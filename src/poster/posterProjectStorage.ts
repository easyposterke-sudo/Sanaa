import type { PosterProject } from './types';

const STORAGE_KEY = 'poster_autosave_project';

function safeParse(json: string): PosterProject | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.elements)) return null;
    if (typeof parsed.canvasWidth !== 'number' || typeof parsed.canvasHeight !== 'number') return null;
    return parsed as PosterProject;
  } catch {
    return null;
  }
}

/** Load the auto-saved poster project from localStorage, or null if none or invalid. */
export function loadPosterProjectFromStorage(): PosterProject | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return safeParse(raw);
}

/** Save the poster project to localStorage. Returns false when the browser rejects it (for example quota exceeded). */
export function savePosterProjectToStorage(project: PosterProject): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}
