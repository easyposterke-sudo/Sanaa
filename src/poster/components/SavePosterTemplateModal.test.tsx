import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  publishPosterTemplateToCloud,
  updatePosterTemplateFromCloud,
  refreshTemplateList,
} = vi.hoisted(() => ({
  publishPosterTemplateToCloud: vi.fn(),
  updatePosterTemplateFromCloud: vi.fn(),
  refreshTemplateList: vi.fn(),
}));

vi.mock('../services/posterTemplatesApi', () => ({
  publishPosterTemplateToCloud,
  updatePosterTemplateFromCloud,
  fetchPosterTemplateList: refreshTemplateList,
  fetchPosterTemplateById: vi.fn(),
}));

vi.mock('../canvasRef', () => ({
  getFabricCanvasRef: () => null,
  capturePosterThumbnail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/resolveBlobUrlsInProject', () => ({
  resolveBlobUrlsInProject: vi.fn(async (project: unknown) => project),
  applyResolvedBlobUrlsToPosterStore: vi.fn(),
}));

import { SavePosterTemplateModal } from './SavePosterTemplateModal';

const editedTemplate = {
  id: 'cloud_original',
  name: 'Blue Orange Sunday Service 2',
  category: 'church' as const,
  description: 'A Sunday service variation',
  fields: [],
};

describe('SavePosterTemplateModal', () => {
  beforeEach(() => {
    publishPosterTemplateToCloud.mockReset().mockResolvedValue({ id: 'cloud_copy' });
    updatePosterTemplateFromCloud.mockReset().mockResolvedValue(undefined);
    refreshTemplateList.mockReset().mockResolvedValue([]);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('offers separate update and save-as-new actions for a cloud template', () => {
    render(
      <SavePosterTemplateModal
        open
        isCloudEdit
        template={editedTemplate}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save as new template' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Update template' })).toBeVisible();
  });

  it('creates a new cloud template without updating the original', async () => {
    const onSaved = vi.fn();
    render(
      <SavePosterTemplateModal
        open
        isCloudEdit
        template={editedTemplate}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save as new template' }));

    await waitFor(() => expect(publishPosterTemplateToCloud).toHaveBeenCalledTimes(1));
    expect(updatePosterTemplateFromCloud).not.toHaveBeenCalled();
    expect(publishPosterTemplateToCloud).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'cloud_original',
        name: 'Blue Orange Sunday Service 2',
        category: 'church',
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
