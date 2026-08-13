import type { PosterProject } from './types';

const STORAGE_KEY = 'poster_my_stuff_projects_v1';

export interface SavedPosterProject {
  id: string;
  name: string;
  savedAt: number;
  project: PosterProject;
  thumbnail?: string;
}
function safeParse(json: string): SavedPosterProject[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x === 'object') as SavedPosterProject[];
  } catch {
    return [];
  }
}

export function loadSavedPosterProjects(): SavedPosterProject[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const list = safeParse(raw);
  return list
    .filter((x) => x?.project && Array.isArray(x.project.elements))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

function write(list: SavedPosterProject[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // QuotaExceeded or similar - ignore
  }
}

export function savePosterProjectToMyStuff(entry: {
  name: string;
  project: PosterProject;
  thumbnail?: string;
}): SavedPosterProject {
  const list = loadSavedPosterProjects();
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const saved: SavedPosterProject = {
    id,
    name: entry.name.trim() || 'Untitled poster',
    savedAt: Date.now(),
    project: entry.project,
    thumbnail: entry.thumbnail,
  };
  write([saved, ...list].slice(0, 50));
  return saved;
}

export function deleteSavedPosterProject(id: string): void {
  const list = loadSavedPosterProjects();
  write(list.filter((p) => p.id !== id));
}

export function renameSavedPosterProject(id: string, name: string): void {
  const list = loadSavedPosterProjects();
  const next = list.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  write(next);
}

