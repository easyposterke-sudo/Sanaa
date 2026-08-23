export const MAX_POSTER_BACKGROUND_BYTES = 20 * 1024 * 1024;

export type PosterBackgroundMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

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
