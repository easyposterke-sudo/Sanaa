import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiFetch }));

import { requestTemplatePoster } from './templatePosterApi';

const request = {
  brief: 'Create a Sunday worship experience at Grace Chapel.',
  themeColor: null,
  images: [],
  excludedTemplateIds: [],
  templates: [
    {
      id: 'church-one',
      name: 'Sunday service',
      category: 'church' as const,
      description: 'Simple worship poster',
      fields: [{ key: 'event_title', label: 'Event title', kind: 'text' as const }],
    },
  ],
};

describe('template poster API', () => {
  beforeEach(() => apiFetch.mockReset());

  it('posts the validated brief and returns a structured selection', async () => {
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          selection: {
            schemaVersion: 1,
            templateId: 'church-one',
            fields: [{ key: 'event_title', value: 'Worship Experience', imageIndex: null }],
          },
          source: 'openai',
          model: 'test-model',
          requestId: 'request-1',
        }),
        { status: 200 },
      ),
    );
    await expect(requestTemplatePoster(request)).resolves.toMatchObject({
      selection: { templateId: 'church-one' },
      source: 'openai',
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/ai/template-poster',
      expect.objectContaining({ method: 'POST', timeoutMs: 90_000 }),
    );
  });

  it('surfaces backend errors', async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'No templates found.', code: 'NO_TEMPLATES' }), {
        status: 400,
      }),
    );
    await expect(requestTemplatePoster(request)).rejects.toMatchObject({
      message: 'No templates found.',
      code: 'NO_TEMPLATES',
    });
  });
});
