import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MyStuffPage } from './MyStuffPage';
import { getMyPosterThumbnail, listMyPosterProjects } from '../services/posterProjectsApi';

vi.mock('../services/posterProjectsApi', () => ({
  getMyPosterThumbnail: vi.fn(),
  listMyPosterProjects: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyStuffPage previews', () => {
  it('uses the authenticated thumbnail blob and releases its URL', async () => {
    vi.mocked(listMyPosterProjects).mockResolvedValue({
      items: [{ id: 'poster-1', name: 'Church poster', thumbnail: '/api/my-poster-projects/poster-1/thumbnail' }],
      pagination: { page: 1, limit: 24, total: 1, pages: 1 },
    });
    vi.mocked(getMyPosterThumbnail).mockResolvedValue(new Blob(['image bytes'], { type: 'image/webp' }));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const { unmount } = render(<MyStuffPage />);
    const image = await screen.findByRole('img', { name: 'Preview of Church poster' });
    expect(image).toHaveAttribute('src', 'blob:preview');
    expect(getMyPosterThumbnail).toHaveBeenCalledWith('poster-1', expect.any(AbortSignal));

    unmount();
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:preview'));
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });
});
