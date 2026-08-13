import type { PosterProject } from '../types';
import { apiFetch } from '../../lib/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type SavedPosterProjectItem = {
  id: string;
  name: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
  project?: PosterProject; // Optional because list API now excludes it
};

export type PaginatedSavedPosterProjects = {
  items: SavedPosterProjectItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

/** Load the current user's auto-saved poster project from the cloud. */
export async function loadPosterProjectFromCloud(): Promise<PosterProject | null> {
  const res = await apiFetch('/api/poster-projects');
  if (!res.ok) {
    if (res.status === 401) return null;
    throw new Error(`Failed to load project (${res.status})`);
  }
  const data = (await res.json()) as { project: PosterProject | null };
  return data.project ?? null;
}

/** Save the current user's poster project to the cloud. Returns the processed project (with Cloudinary URLs). */
export async function savePosterProjectToCloud(project: PosterProject): Promise<PosterProject> {
  const res = await apiFetch('/api/poster-projects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ project }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; project?: PosterProject };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  if (!data.project) throw new Error('Invalid response from server');
  return data.project;
}

/** List the current user's saved poster snapshots ("My stuff") from the cloud. Support pagination. */
export async function listMyPosterProjects(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedSavedPosterProjects> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));

  const qs = sp.toString();
  const res = await apiFetch(`/api/my-poster-projects${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    if (res.status === 401) return { items: [], pagination: { page: 1, limit: 24, total: 0, pages: 0 } };
    throw new Error(`Failed to load saved posters (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as PaginatedSavedPosterProjects;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    pagination: data.pagination || { page: 1, limit: 24, total: 0, pages: 0 },
  };
}

/** Fetch a single saved poster project by ID (including full project data). */
export async function getMySavedPosterProject(id: string): Promise<SavedPosterProjectItem> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`Failed to load project (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as { item?: SavedPosterProjectItem };
  if (!data.item) throw new Error('Invalid response from server');
  return data.item;
}

/** Save a snapshot to the user's private cloud "My stuff". */
export async function savePosterProjectToMyCloud(
  params: { name: string; project: PosterProject; thumbnail?: string }
): Promise<SavedPosterProjectItem> {
  const res = await apiFetch('/api/my-poster-projects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; item?: SavedPosterProjectItem };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  if (!data.item) throw new Error('Invalid response from server');
  return data.item;
}

export async function deleteMyPosterProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Delete failed (${res.status})`);
}

export async function renameMyPosterProject(id: string, name: string): Promise<void> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Rename failed (${res.status})`);
}

export async function updateMyPosterProject(params: {
  id: string;
  name?: string;
  project?: PosterProject;
  thumbnail?: string;
  patch?: { canvasWidth?: number; canvasHeight?: number; canvasBackground?: unknown; removeElementIds?: string[]; upsertElements?: unknown[] };
  ifUnmodifiedSince?: string;
}): Promise<SavedPosterProjectItem> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.project !== undefined ? { project: params.project } : {}),
      ...(params.thumbnail !== undefined ? { thumbnail: params.thumbnail } : {}),
      ...(params.patch !== undefined ? { patch: params.patch } : {}),
      ...(params.ifUnmodifiedSince !== undefined ? { ifUnmodifiedSince: params.ifUnmodifiedSince } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; item?: SavedPosterProjectItem };
  if (!res.ok) throw new Error(data.error || `Update failed (${res.status})`);
  if (!data.item) throw new Error('Invalid response from server');
  return data.item;
}
