const REMOVE_BG_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';
const MAX_ERROR_BYTES = 64 * 1024;

type RemoveBgStatus = 422 | 429 | 502 | 503;

export class RemoveBgUpstreamError extends Error {
  readonly code: string;
  readonly status: RemoveBgStatus;
  readonly retryAfter?: string;

  constructor(options: {
    message: string;
    code: string;
    status: RemoveBgStatus;
    retryAfter?: string;
  }) {
    super(options.message);
    this.name = 'RemoveBgUpstreamError';
    this.code = options.code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

export async function removeBackgroundWithRemoveBg(options: {
  image: Blob;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const form = new FormData();
  form.append('image_file', options.image, fileNameForMediaType(options.image.type));
  form.append('size', 'auto');
  form.append('format', 'webp');

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(REMOVE_BG_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Api-Key': options.apiKey },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    throw new RemoveBgUpstreamError({
      message:
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Background removal timed out. Try a smaller image.'
          : 'The background-removal service could not be reached.',
      code: 'BACKGROUND_REMOVAL_UNAVAILABLE',
      status: 502,
    });
  }

  if (!response.ok) {
    const detail = await readBoundedError(response, MAX_ERROR_BYTES);
    const retryAfter = response.headers.get('retry-after') ?? undefined;
    if (response.status === 429) {
      throw new RemoveBgUpstreamError({
        message: 'Background removal is busy. Please try again shortly.',
        code: 'BACKGROUND_REMOVAL_RATE_LIMITED',
        status: 429,
        retryAfter,
      });
    }
    if (response.status === 402) {
      throw new RemoveBgUpstreamError({
        message: 'The Remove.bg account has no API credits remaining.',
        code: 'BACKGROUND_REMOVAL_CREDITS_EXHAUSTED',
        status: 429,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new RemoveBgUpstreamError({
        message: 'Background removal is not configured correctly.',
        code: 'BACKGROUND_REMOVAL_NOT_CONFIGURED',
        status: 503,
      });
    }
    if (response.status >= 400 && response.status < 500) {
      throw new RemoveBgUpstreamError({
        message: detail || 'Remove.bg could not find a removable foreground in this image.',
        code: 'BACKGROUND_REMOVAL_REJECTED',
        status: 422,
      });
    }
    throw new RemoveBgUpstreamError({
      message: 'Remove.bg could not process this image.',
      code: 'BACKGROUND_REMOVAL_UPSTREAM',
      status: 502,
    });
  }

  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!response.body || !mediaType || !['image/webp', 'image/png'].includes(mediaType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new RemoveBgUpstreamError({
      message: 'Remove.bg returned an unsupported image result.',
      code: 'BACKGROUND_REMOVAL_INVALID_RESULT',
      status: 502,
    });
  }

  return response;
}

function fileNameForMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'source.png';
  if (mediaType === 'image/webp') return 'source.webp';
  return 'source.jpg';
}

async function readBoundedError(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('Remove.bg error response was too large.');
        break;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    const parsed = JSON.parse(text) as { errors?: Array<{ title?: unknown }> };
    const title = parsed.errors?.[0]?.title;
    return typeof title === 'string' ? title.trim().slice(0, 240) : '';
  } catch {
    return '';
  }
}
