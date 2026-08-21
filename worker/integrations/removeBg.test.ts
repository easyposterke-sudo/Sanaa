import { describe, expect, it, vi } from 'vitest';
import { RemoveBgUpstreamError, removeBackgroundWithRemoveBg } from './removeBg';

describe('removeBackgroundWithRemoveBg', () => {
  it('sends a bounded image request with the API key and asks for transparent WebP', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('x-api-key')).toBe('secret-key');
      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      const form = body as FormData;
      expect(form.get('size')).toBe('auto');
      expect(form.get('format')).toBe('webp');
      expect(form.get('image_file')).toBeInstanceOf(Blob);
      return new Response(new Blob(['transparent'], { type: 'image/webp' }), {
        headers: { 'content-type': 'image/webp' },
      });
    });

    const response = await removeBackgroundWithRemoveBg({
      image: new Blob(['source'], { type: 'image/png' }),
      apiKey: 'secret-key',
      fetcher,
    });

    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('maps Remove.bg rate limits to a safe retryable error', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ title: 'Too many requests' }] }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '30' },
      }),
    );

    await expect(
      removeBackgroundWithRemoveBg({
        image: new Blob(['source'], { type: 'image/jpeg' }),
        apiKey: 'secret-key',
        fetcher,
      }),
    ).rejects.toMatchObject({
      code: 'BACKGROUND_REMOVAL_RATE_LIMITED',
      status: 429,
      retryAfter: '30',
    } satisfies Partial<RemoveBgUpstreamError>);
  });

  it('rejects non-image success responses', async () => {
    const fetcher = vi.fn(async () =>
      new Response('not an image', { headers: { 'content-type': 'text/plain' } }),
    );

    await expect(
      removeBackgroundWithRemoveBg({
        image: new Blob(['source'], { type: 'image/webp' }),
        apiKey: 'secret-key',
        fetcher,
      }),
    ).rejects.toMatchObject({
      code: 'BACKGROUND_REMOVAL_INVALID_RESULT',
      status: 502,
    } satisfies Partial<RemoveBgUpstreamError>);
  });
});
