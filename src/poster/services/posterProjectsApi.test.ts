import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyPosterThumbnail } from './posterProjectsApi';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('getMyPosterThumbnail', () => {
  it('fetches the private image with the account token', async () => {
    localStorage.setItem('auth_token', 'test-token');
    const image = new Blob(['image bytes'], { type: 'image/webp' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(image, {
      headers: { 'content-type': 'image/webp' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getMyPosterThumbnail('poster 1')).toEqual(image);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/my-poster-projects/poster%201/thumbnail',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});
