import { apiFetch } from '../../lib/api';

export const MAX_POSTER_BACKGROUND_BYTES = 20 * 1024 * 1024;
const BACKGROUND_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface PosterBackgroundLibraryItem {
  id: string;
  label: string;
  url: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  createdAt: string;
}

export async function listPosterBackgrounds(): Promise<PosterBackgroundLibraryItem[]> {
  const response = await apiFetch('/api/poster-backgrounds');
  const data = (await response.json().catch(() => [])) as PosterBackgroundLibraryItem[] | { error?: string };
  if (!response.ok) {
    const error = !Array.isArray(data) ? data.error : undefined;
    throw new Error(error || `Failed to load backgrounds (${response.status})`);
  }
  return Array.isArray(data) ? data : [];
}

export async function uploadPosterBackground(
  file: File,
  label: string,
): Promise<PosterBackgroundLibraryItem> {
  if (!BACKGROUND_MEDIA_TYPES.has(file.type)) {
    throw new Error('Backgrounds must be PNG, JPEG, or WebP images.');
  }
  if (file.size <= 0 || file.size > MAX_POSTER_BACKGROUND_BYTES) {
    throw new Error('Background images must be 20 MB or smaller.');
  }

  const response = await apiFetch('/api/poster-backgrounds', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Background-Label': encodeURIComponent(label.trim()),
    },
    body: file,
  });
  const data = (await response.json().catch(() => ({}))) as PosterBackgroundLibraryItem & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || `Background upload failed (${response.status})`);
  }
  return data;
}

export async function removePosterBackground(id: string): Promise<void> {
  const response = await apiFetch(`/api/poster-backgrounds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (response.ok) return;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error || `Could not remove background (${response.status})`);
}
