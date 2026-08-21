import { apiFetch, fetchWithTimeout } from '../../lib/api';

const MAX_SOURCE_BYTES = 22 * 1024 * 1024;
const SUPPORTED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function removeImageBackground(source: string): Promise<string> {
  const sourceResponse = await fetchWithTimeout(source, {}, 30_000).catch(() => {
    throw new Error('The selected image could not be read. Re-upload it and try again.');
  });
  if (!sourceResponse.ok) {
    throw new Error('The selected image could not be downloaded. Re-upload it and try again.');
  }

  const sourceBlob = await sourceResponse.blob();
  if (!SUPPORTED_SOURCE_TYPES.has(sourceBlob.type)) {
    throw new Error('Background removal supports PNG, JPEG, and WebP images.');
  }
  if (sourceBlob.size <= 0 || sourceBlob.size > MAX_SOURCE_BYTES) {
    throw new Error('Use an image between 1 byte and 22 MB.');
  }

  const form = new FormData();
  form.append('image', sourceBlob, fileNameForMediaType(sourceBlob.type));
  const response = await apiFetch('/api/images/remove-background', {
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Background removal failed (${response.status}).`,
    );
  }

  const result = await response.blob();
  if (result.size <= 0 || !['image/webp', 'image/png'].includes(result.type)) {
    throw new Error('Background removal returned an invalid image.');
  }
  return blobToDataUrl(result);
}

function fileNameForMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'source.png';
  if (mediaType === 'image/webp') return 'source.webp';
  return 'source.jpg';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The processed image could not be read.'));
    reader.readAsDataURL(blob);
  });
}
