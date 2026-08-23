import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiFetch }));

import {
  listPosterBackgrounds,
  removePosterBackground,
  uploadPosterBackground,
} from './posterBackgroundsApi';

describe('poster backgrounds API', () => {
  beforeEach(() => apiFetch.mockReset());

  it('uploads the original image bytes with encoded metadata headers', async () => {
    const item = {
      id: 'bg-1',
      label: 'Gold paper',
      url: '/api/poster-backgrounds/bg-1/file',
      originalName: 'gold paper.png',
      mediaType: 'image/png',
      byteSize: 8,
      createdAt: '2026-08-23T00:00:00.000Z',
    };
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify(item), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const file = new File(['png-data'], 'gold paper.png', { type: 'image/png' });

    await expect(uploadPosterBackground(file, 'Gold paper')).resolves.toEqual(item);
    expect(apiFetch).toHaveBeenCalledWith('/api/poster-backgrounds', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-File-Name': 'gold%20paper.png',
        'X-Background-Label': 'Gold%20paper',
      },
      body: file,
    });
  });

  it('rejects unsupported files before making a request', async () => {
    const file = new File(['svg'], 'background.svg', { type: 'image/svg+xml' });
    await expect(uploadPosterBackground(file, 'Vector')).rejects.toThrow('PNG, JPEG, or WebP');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('lists and removes backgrounds', async () => {
    apiFetch
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(listPosterBackgrounds()).resolves.toEqual([]);
    await expect(removePosterBackground('bg-1')).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenLastCalledWith('/api/poster-backgrounds/bg-1', {
      method: 'DELETE',
    });
  });
});
