/**
 * In-memory cache for user-uploaded fonts (TTF/OTF) parsed with opentype.js.
 * Keys are stable IDs; values are display name and the parsed font.
 */
import type { OpenTypeFont } from './opentypeToThree';
import { fetchWithTimeout } from '../../lib/api';

export interface CachedFont {
  id: string;
  name: string;
  font: OpenTypeFont;
  /** URL for CSS preview (https or blob:). */
  previewSourceUrl?: string | null;
}

const cache = new Map<string, CachedFont>();

const previewFaces = new Map<string, FontFace>();

function cssSafeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** CSS `font-family` for a preview cache key (matches `fontFamily` stored on poster text). */
export function familyNameForPreviewKey(key: string): string {
  return `Editor3DCustom_${cssSafeKey(key)}`;
}

/**
 * Load a font from a URL for UI preview (dropdown labels). Returns CSS font-family name.
 */
export async function ensureFontPreviewFromUrl(key: string, url: string): Promise<string> {
  const existing = previewFaces.get(key);
  if (existing) return existing.family;

  const family = familyNameForPreviewKey(key);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Font preview fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const ff = new FontFace(family, buf);
  await ff.load();
  document.fonts.add(ff);
  previewFaces.set(key, ff);
  return ff.family;
}

export function releaseFontPreview(key: string): void {
  const ff = previewFaces.get(key);
  if (ff) {
    try {
      document.fonts.delete(ff);
    } catch {
      // ignore
    }
    previewFaces.delete(key);
  }
}

export function addCustomFont(
  id: string,
  name: string,
  font: OpenTypeFont,
  previewSourceUrl?: string | null
): void {
  const prev = cache.get(id);
  if (prev?.previewSourceUrl?.startsWith('blob:') && prev.previewSourceUrl !== previewSourceUrl) {
    try {
      URL.revokeObjectURL(prev.previewSourceUrl);
    } catch {
      // ignore
    }
  }
  cache.set(id, { id, name, font, previewSourceUrl: previewSourceUrl ?? prev?.previewSourceUrl });
}

export function getCustomFont(id: string): CachedFont | undefined {
  return cache.get(id);
}

export function getAllCustomFonts(): CachedFont[] {
  return Array.from(cache.values());
}

export function removeCustomFont(id: string): void {
  const entry = cache.get(id);
  if (entry?.previewSourceUrl?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(entry.previewSourceUrl);
    } catch {
      // ignore
    }
  }
  releaseFontPreview(id);
  cache.delete(id);
}
