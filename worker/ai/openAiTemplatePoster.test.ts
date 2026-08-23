import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplatePosterRequestSchema } from '../../shared/ai/templatePoster';
import {
  OpenAiTemplatePosterError,
  selectTemplatePosterWithOpenAI,
} from './openAiTemplatePoster';

const request = TemplatePosterRequestSchema.parse({
  brief: 'Create a worship experience on Sunday at Grace Chapel.',
  themeColor: null,
  images: [],
  excludedTemplateIds: [],
  templates: [
    {
      id: 'church-one',
      name: 'Sunday service',
      category: 'church',
      description: 'Simple worship poster',
      fields: [{ key: 'event_title', label: 'Event title', kind: 'text' }],
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI template poster selector', () => {
  it('uses structured output and validates the selected catalog template', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'resp_1',
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    schemaVersion: 1,
                    templateId: 'church-one',
                    fields: [
                      { key: 'event_title', value: 'Worship Experience', imageIndex: null },
                    ],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 30 },
        }),
        { status: 200, headers: { 'x-request-id': 'req_1' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await selectTemplatePosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
    });
    expect(result.selection.templateId).toBe('church-one');
    expect(result.openAiRequestId).toBe('req_1');
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as {
      store?: boolean;
      text?: { format?: { type?: string; strict?: boolean } };
    };
    expect(payload.store).toBe(false);
    expect(payload.text?.format).toMatchObject({ type: 'json_schema', strict: true });
  });

  it('rejects a template id outside the supplied catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({ schemaVersion: 1, templateId: 'invented', fields: [] }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const error = await selectTemplatePosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OpenAiTemplatePosterError);
    expect(error).toMatchObject({ code: 'AI_INVALID_SELECTION', status: 502 });
  });
});
