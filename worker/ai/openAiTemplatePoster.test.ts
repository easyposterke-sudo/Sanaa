import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplatePosterRequestSchema } from '../../shared/ai/templatePoster';
import {
  OpenAiTemplatePosterError,
  selectTemplatePosterWithOpenAI,
} from './openAiTemplatePoster';

const request = TemplatePosterRequestSchema.parse({
  brief: 'Create a worship experience poster.',
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
    expect(result.usedFallback).toBe(false);
    expect(result.openAiRequestId).toBe('req_1');
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as {
      store?: boolean;
      text?: {
        format?: {
          type?: string;
          strict?: boolean;
          schema?: { properties?: { templateId?: { enum?: string[] } } };
        };
      };
    };
    expect(payload.store).toBe(false);
    expect(payload.text?.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(payload.text?.format?.schema?.properties?.templateId?.enum).toEqual(['church-one']);
  });

  it('falls back safely when the model returns an id outside the supplied catalog', async () => {
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

    const result = await selectTemplatePosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
    });
    expect(result.selection.templateId).toBe('church-one');
    expect(result.usedFallback).toBe(true);
  });

  it('removes previously used templates from both the prompt and id schema', async () => {
    const requestWithExcluded = TemplatePosterRequestSchema.parse({
      ...request,
      excludedTemplateIds: ['church-one'],
      templates: [
        request.templates[0],
        {
          ...request.templates[0],
          id: 'church-two',
          name: 'Second Sunday design',
        },
      ],
    });
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) =>
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    schemaVersion: 1,
                    templateId: 'church-two',
                    fields: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await selectTemplatePosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request: requestWithExcluded,
    });

    expect(result.selection.templateId).toBe('church-two');
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payloadText = String(options.body);
    const payload = JSON.parse(payloadText) as {
      text?: { format?: { schema?: { properties?: { templateId?: { enum?: string[] } } } } };
    };
    expect(payload.text?.format?.schema?.properties?.templateId?.enum).toEqual(['church-two']);
    expect(payloadText).not.toContain('church-one');
  });

  it('does not call the model when no template can represent supplied major facts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const incompatibleRequest = TemplatePosterRequestSchema.parse({
      ...request,
      brief: 'Create a worship poster. Theme: Arise.',
    });

    const error = await selectTemplatePosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request: incompatibleRequest,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAiTemplatePosterError);
    expect(error).toMatchObject({ code: 'NO_COMPATIBLE_TEMPLATE', status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
