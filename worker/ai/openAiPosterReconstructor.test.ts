import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PosterReconstructionRequest } from '../../shared/ai/posterReconstruction';
import {
  OpenAiPosterReconstructionError,
  POSTER_RECONSTRUCTION_MAX_OUTPUT_TOKENS,
  reconstructPosterWithOpenAI,
} from './openAiPosterReconstructor';

const request: PosterReconstructionRequest = {
  reference: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1080,
    height: 1080,
  },
  quality: 'quality',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reconstructPosterWithOpenAI incomplete responses', () => {
  it('uses the reconstruction output allowance and reports output-limit details', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'resp_output_limit',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [],
          usage: { input_tokens: 321, output_tokens: 12_000 },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_output_limit',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await reconstructPosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAiPosterReconstructionError);
    expect(error).toMatchObject({
      code: 'AI_OUTPUT_LIMIT',
      status: 502,
      details: {
        openAiRequestId: 'req_output_limit',
        incompleteReason: 'max_output_tokens',
        inputTokens: 321,
        outputTokens: 12_000,
      },
    });
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { max_output_tokens?: number; store?: boolean };
    expect(payload.max_output_tokens).toBe(POSTER_RECONSTRUCTION_MAX_OUTPUT_TOKENS);
    expect(payload.store).toBe(false);
  });

  it('reports content-filter incompletes separately', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'resp_content_filter',
            status: 'incomplete',
            incomplete_details: { reason: 'content_filter' },
            output: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const error = await reconstructPosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAiPosterReconstructionError);
    expect(error).toMatchObject({
      code: 'AI_CONTENT_FILTER',
      status: 422,
      details: {
        openAiRequestId: 'resp_content_filter',
        incompleteReason: 'content_filter',
        inputTokens: null,
        outputTokens: null,
      },
    });
  });

  it('keeps timeout failures distinct from incomplete responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
      ),
    );

    const error = await reconstructPosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request,
      timeoutMs: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'AI_TIMEOUT', status: 504 });
  });
});
