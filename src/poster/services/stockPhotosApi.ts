import { apiFetch } from '../../lib/api';
import { prepareTemplateReference, type PreparedPosterImage } from '../ai/preparePosterImage';

export interface StockPhotoCandidate {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
  thumbnailUrl: string;
}

export class StockPhotoError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StockPhotoError';
  }
}

export async function searchStockPhotos(input: {
  query: string;
  orientation?: 'landscape' | 'portrait' | 'square';
  color?: string | null;
}): Promise<StockPhotoCandidate[]> {
  const params = new URLSearchParams({ query: input.query, perPage: '8' });
  if (input.orientation) params.set('orientation', input.orientation);
  if (input.color) params.set('color', input.color);
  const response = await apiFetch(`/api/stock-photos/search?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | { photos?: StockPhotoCandidate[]; error?: string; code?: string }
    | null;
  if (!response.ok) {
    throw new StockPhotoError(
      payload?.error || 'Stock photo search is unavailable.',
      payload?.code,
    );
  }
  return Array.isArray(payload?.photos) ? payload.photos : [];
}

export async function downloadStockPhoto(photo: StockPhotoCandidate): Promise<PreparedPosterImage> {
  const response = await apiFetch(`/api/stock-photos/${photo.id}/image`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new StockPhotoError(payload?.error || 'The selected stock photo could not be downloaded.');
  }
  const blob = await response.blob();
  return prepareTemplateReference(
    new File([blob], `pexels-${photo.id}.${extensionFor(blob.type)}`, { type: blob.type }),
  );
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}
