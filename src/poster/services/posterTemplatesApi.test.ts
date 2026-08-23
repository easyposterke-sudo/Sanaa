import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiFetch }));

import {
  fetchMyPosterTemplateList,
  PosterTemplateAccessError,
} from './posterTemplatesApi';

describe('poster templates API', () => {
  beforeEach(() => apiFetch.mockReset());

  it('loads only the current owner template list from the private endpoint', async () => {
    const templates = [
      {
        id: 'cloud_owned',
        name: 'Sunday worship',
        category: 'church',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
    ];
    apiFetch.mockResolvedValue(new Response(JSON.stringify(templates), { status: 200 }));

    await expect(fetchMyPosterTemplateList()).resolves.toEqual(templates);
    expect(apiFetch).toHaveBeenCalledWith('/api/poster-templates/mine');
  });

  it('reports private access denial without exposing template data', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 }));

    await expect(fetchMyPosterTemplateList()).rejects.toBeInstanceOf(PosterTemplateAccessError);
  });
});
