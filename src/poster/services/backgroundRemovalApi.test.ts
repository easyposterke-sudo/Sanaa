import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, fetchWithTimeout } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ apiFetch, fetchWithTimeout }));

import { removeImageBackground } from './backgroundRemovalApi';

describe('removeImageBackground', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    fetchWithTimeout.mockReset();
  });

  it('uploads the selected image and returns a persistent transparent data URL', async () => {
    fetchWithTimeout.mockResolvedValue(
      new Response(new Blob(['source'], { type: 'image/png' }), {
        headers: { 'content-type': 'image/png' },
      }),
    );
    apiFetch.mockResolvedValue(
      new Response(new Blob(['transparent'], { type: 'image/webp' }), {
        headers: { 'content-type': 'image/webp' },
      }),
    );

    const result = await removeImageBackground('data:image/png;base64,c291cmNl');

    expect(result).toMatch(/^data:image\/webp;base64,/);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'data:image/png;base64,c291cmNl',
      {},
      30_000,
    );
    expect(apiFetch).toHaveBeenCalledOnce();
    const [url, options] = apiFetch.mock.calls[0] as [string, RequestInit & { timeoutMs: number }];
    expect(url).toBe('/api/images/remove-background');
    expect(options.method).toBe('POST');
    expect(options.timeoutMs).toBe(120_000);
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('shows the Worker error without exposing response internals', async () => {
    fetchWithTimeout.mockResolvedValue(
      new Response(new Blob(['source'], { type: 'image/jpeg' }), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Background removal is not configured yet.' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(removeImageBackground('data:image/jpeg;base64,c291cmNl')).rejects.toThrow(
      'Background removal is not configured yet.',
    );
  });

  it('rejects unsupported image sources before spending an API credit', async () => {
    fetchWithTimeout.mockResolvedValue(
      new Response(new Blob(['svg'], { type: 'image/svg+xml' }), {
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );

    await expect(removeImageBackground('data:image/svg+xml;base64,c3Zn')).rejects.toThrow(
      'supports PNG, JPEG, and WebP',
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
