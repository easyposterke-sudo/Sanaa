import opentype from 'opentype.js';
import { apiFetch } from '../../lib/api';

export interface FontLibraryEntry {
  id: string;
  label: string;
  fontUrl: string;
  fileName: string;
  format: 'ttf' | 'otf';
  byteSize: number;
  uploadedAt: string;
}

export const FONT_LIBRARY_CHANGED_EVENT = 'easyposter:font-library-changed';
const MAX_FONT_FILE_BYTES = 30 * 1024 * 1024;

export async function listFontLibrary(): Promise<FontLibraryEntry[]> {
  const response = await apiFetch('/api/fonts');
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(readApiError(data, 'Could not load the font library.'));
  return Array.isArray(data) ? (data as FontLibraryEntry[]) : [];
}

export async function inspectFontFile(file: File): Promise<{ label: string }> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (extension !== '.ttf' && extension !== '.otf') {
    throw new Error(`${file.name}: only .ttf and .otf files are supported.`);
  }
  if (file.size <= 0 || file.size > MAX_FONT_FILE_BYTES) {
    throw new Error(`${file.name}: each font must be between 1 byte and 30 MB.`);
  }
  try {
    const font = opentype.parse(await file.arrayBuffer());
    const label =
      font.names?.fontFamily?.en ||
      font.names?.fullName?.en ||
      file.name.replace(/\.(ttf|otf)$/i, '') ||
      'Custom font';
    return { label };
  } catch {
    throw new Error(`${file.name}: this file is not a valid TrueType or OpenType font.`);
  }
}

export async function uploadFontFile(file: File, label: string): Promise<FontLibraryEntry> {
  const form = new FormData();
  form.append('label', label);
  form.append('font', file);
  const response = await apiFetch('/api/fonts/upload', { method: 'POST', body: form });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(readApiError(data, `${file.name}: upload failed.`));
  return data as FontLibraryEntry;
}

export function notifyFontLibraryChanged(): void {
  window.dispatchEvent(new Event(FONT_LIBRARY_CHANGED_EVENT));
}

function readApiError(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}
