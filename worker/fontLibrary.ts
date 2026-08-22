export const FONT_LIBRARY_PREFIX = 'font-library/';
export const MAX_FONT_FILE_BYTES = 10 * 1024 * 1024;

export type FontFormat = 'ttf' | 'otf';

export interface FontLibraryEntry {
  id: string;
  label: string;
  fontUrl: string;
  fileName: string;
  format: FontFormat;
  byteSize: number;
  uploadedAt: string;
}

export function detectFontFormat(fileName: string, bytes: Uint8Array): FontFormat | null {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  if (extension !== 'ttf' && extension !== 'otf') return null;
  if (bytes.length < 4) return null;

  const signature = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (extension === 'otf') return signature === 'OTTO' ? 'otf' : null;

  const isTrueType =
    (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
    signature === 'true' ||
    signature === 'typ1';
  return isTrueType ? 'ttf' : null;
}

export function cleanFontLabel(value: string, fallback: string): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  const cleaned = withoutControls.replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 120);
}

export function fontObjectKey(id: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? `${FONT_LIBRARY_PREFIX}${id}`
    : null;
}

export async function listFontLibrary(bucket: R2Bucket): Promise<FontLibraryEntry[]> {
  const entries: FontLibraryEntry[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({
      prefix: FONT_LIBRARY_PREFIX,
      cursor,
      limit: 1000,
      include: ['customMetadata', 'httpMetadata'],
    });
    for (const object of page.objects) {
      const metadata = object.customMetadata;
      const id = metadata?.fontId;
      const format = metadata?.format;
      if (!id || (format !== 'ttf' && format !== 'otf')) continue;
      entries.push({
        id,
        label: cleanFontLabel(metadata.label || '', metadata.fileName || 'Custom font'),
        fontUrl: `/api/fonts/${encodeURIComponent(id)}/file`,
        fileName: metadata.fileName || `font.${format}`,
        format,
        byteSize: object.size,
        uploadedAt: metadata.uploadedAt || object.uploaded.toISOString(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return entries.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
