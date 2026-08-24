export const MAX_POSTER_BACKGROUND_BYTES = 20 * 1024 * 1024;

export type PosterBackgroundMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface TemplateBackgroundCandidate {
  src: string;
  label: string;
}

export function isPosterBackgroundMediaType(value: string): value is PosterBackgroundMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

export function cleanPosterBackgroundLabel(value: string, fallback: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Preserve the original header value when it is not percent encoded.
  }
  const printable = [...decoded]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? ' ' : character;
    })
    .join('');
  const cleaned = printable.replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 100);
}

export function posterBackgroundObjectKey(
  ownerId: string,
  id: string,
  fileName: string,
): string {
  return `owners/${encodeURIComponent(ownerId)}/backgrounds/${id}/${encodeURIComponent(fileName)}`;
}

export function matchesPosterBackgroundSignature(
  mediaType: PosterBackgroundMediaType,
  bytes: Uint8Array,
): boolean {
  if (mediaType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (mediaType === 'image/jpeg') {
    return (
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

export function parsePosterBackgroundDataUrl(
  value: string,
): { mediaType: PosterBackgroundMediaType; bytes: Uint8Array } | null {
  const match = value.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
  );
  const mediaType = match?.[1];
  const encoded = match?.[2];
  if (!mediaType || !encoded || !isPosterBackgroundMediaType(mediaType)) return null;
  try {
    const binary = atob(encoded.replace(/[\r\n]/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!matchesPosterBackgroundSignature(mediaType, bytes)) return null;
    return { mediaType, bytes };
  } catch {
    return null;
  }
}

/**
 * Finds raster image layers that act as template backgrounds. New layers carry
 * `assetRole`; the name fallback also discovers templates saved before that
 * metadata existed.
 */
export function findTemplateBackgroundCandidates(project: {
  elements: ReadonlyArray<Record<string, unknown>>;
}): TemplateBackgroundCandidate[] {
  const candidates: TemplateBackgroundCandidate[] = [];
  for (const element of project.elements) {
    if (element.type !== 'image' || element.excludeFromExport === true) continue;
    const src = typeof element.src === 'string' ? element.src : '';
    const layerName = typeof element.layerName === 'string' ? element.layerName.trim() : '';
    const isBackground =
      element.assetRole === 'background' || /\bbackground\b/i.test(layerName);
    if (!src || !isBackground || src.startsWith('/api/poster-backgrounds/')) continue;

    const explicitLabel =
      typeof element.backgroundLibraryLabel === 'string'
        ? element.backgroundLibraryLabel.trim()
        : '';
    const layerLabel = layerName
      .replace(/^background\s*:\s*/i, '')
      .replace(/^ai (?:replacement|draft)\s*:\s*/i, '')
      .trim();
    candidates.push({
      src,
      label: explicitLabel || layerLabel || 'Template background',
    });
  }
  return candidates;
}

export async function posterBackgroundContentId(
  ownerId: string,
  bytes: Uint8Array,
): Promise<string> {
  const ownerBytes = new TextEncoder().encode(`${ownerId}\0`);
  const input = new Uint8Array(ownerBytes.byteLength + bytes.byteLength);
  input.set(ownerBytes);
  input.set(bytes, ownerBytes.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `template_bg_${hex}`;
}
