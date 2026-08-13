import { apiFetch, getToken } from '../../lib/api';
import type { EditorState } from '../../core/types';
import type { PosterProject } from '../types';

export type Poster3dLibraryConfig = Partial<EditorState>;

export interface UserPosterImage {
  id: string;
  url: string;
  originalName: string;
  createdAt?: string;
  poster3dConfig?: Poster3dLibraryConfig;
}

export async function listUserPosterImages(): Promise<UserPosterImage[]> {
  const res = await apiFetch('/api/user-poster-images');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to load images (${res.status})`);
  }
  const data = (await res.json()) as UserPosterImage[];
  return Array.isArray(data) ? data : [];
}

export async function uploadUserPosterImage(
  file: File,
  options?: { poster3dConfig?: Poster3dLibraryConfig }
): Promise<UserPosterImage> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.poster3dConfig != null) {
    formData.append('poster3dConfig', JSON.stringify(options.poster3dConfig));
  }

  const res = await apiFetch('/api/user-poster-images', {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as UserPosterImage & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data as UserPosterImage;
}

export async function replaceUserPosterImage(
  id: string,
  file: File,
  options?: { poster3dConfig?: Poster3dLibraryConfig }
): Promise<UserPosterImage> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.poster3dConfig != null) {
    formData.append('poster3dConfig', JSON.stringify(options.poster3dConfig));
  }

  const res = await apiFetch(`/api/user-poster-images/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as UserPosterImage & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Replace failed (${res.status})`);
  }
  return data as UserPosterImage;
}

export async function deleteUserPosterImage(id: string): Promise<void> {
  const res = await apiFetch(`/api/user-poster-images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

/** Upload a raster (e.g. PNG data URL) to the user’s poster image library. */
export async function uploadUserPosterImageFromDataUrl(
  dataUrl: string,
  filename = 'export.png',
  poster3dConfig?: Poster3dLibraryConfig
): Promise<UserPosterImage> {
  const file = await dataUrlToFile(dataUrl, filename);
  return uploadUserPosterImage(file, poster3dConfig != null ? { poster3dConfig } : undefined);
}

/** Replace an existing library image in place (same Mongo row, new Cloudinary bytes). */
export async function replaceUserPosterImageFromDataUrl(
  id: string,
  dataUrl: string,
  filename: string,
  poster3dConfig?: Poster3dLibraryConfig
): Promise<string> {
  const file = await dataUrlToFile(dataUrl, filename);
  const item = await replaceUserPosterImage(
    id,
    file,
    poster3dConfig != null ? { poster3dConfig } : undefined
  );
  return item.url;
}

/**
 * When logged in, upload raster to cloud; otherwise or on failure, return original data URL.
 * `userPosterImageId` is set when the image was stored as a new library row.
 */
export async function uploadRasterToUserLibrary(
  dataUrl: string,
  filename: string,
  poster3dConfig?: Poster3dLibraryConfig
): Promise<{ url: string; userPosterImageId?: string }> {
  if (!getToken()) return { url: dataUrl };
  try {
    const item = await uploadUserPosterImageFromDataUrl(dataUrl, filename, poster3dConfig);
    return { url: item.url, userPosterImageId: item.id };
  } catch {
    return { url: dataUrl };
  }
}

/**
 * When logged in, upload raster to cloud and return stable URL; otherwise or on failure, return original data URL.
 */
export async function preferCloudUrlForPosterRaster(
  dataUrl: string,
  filename = `export-${Date.now()}.png`
): Promise<string> {
  const r = await uploadRasterToUserLibrary(dataUrl, filename);
  return r.url;
}

/**
 * After a successful cloud poster save, update linked `/api/user-poster-images` rows so
 * "Your images" shows the same pixels as the poster (masked/edited layers).
 */
export async function syncLinkedUserPosterImagesAfterCloudSave(project: PosterProject): Promise<void> {
  if (!getToken()) return;

  const seen = new Set<string>();
  for (const el of project.elements) {
    if (el.type === 'image') {
      const id = el.userPosterImageId;
      if (!id || seen.has(id)) continue;
      const src = el.src;
      if (typeof src !== 'string' || src.startsWith('blob:')) continue;
      seen.add(id);
      try {
        const file = await dataUrlToFile(src, 'poster-sync.png');
        await replaceUserPosterImage(id, file);
      } catch {
        /* best-effort */
      }
    } else if (el.type === '3d-text') {
      const id = el.userPosterImageId;
      if (!id || seen.has(id)) continue;
      const src = el.image;
      if (typeof src !== 'string' || src.startsWith('blob:')) continue;
      seen.add(id);
      try {
        const file = await dataUrlToFile(src, 'poster-sync-3d.png');
        await replaceUserPosterImage(id, file, { poster3dConfig: el.config });
      } catch {
        /* best-effort */
      }
    }
  }
}
