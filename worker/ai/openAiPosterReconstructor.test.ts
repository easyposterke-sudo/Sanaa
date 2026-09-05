import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PosterReconstructionRequest } from '../../shared/ai/posterReconstruction';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION } from '../../shared/ai/posterReconstruction';
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

  it('attaches custom font specimens and accepts only catalogue IDs supplied by the client', async () => {
    const responsePlan = {
      schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
      suggestedTemplateName: 'Font test',
      category: 'general',
      summary: 'A custom-font reconstruction.',
      canvas: {
        backgroundType: 'solid',
        backgroundTop: '#ffffff',
        backgroundBottom: '#ffffff',
        gradientAngle: 0,
      },
      elements: [reconstructionTextElement('c_not_supplied')],
      warnings: [],
      confidence: 0.9,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_fonts',
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(responsePlan) }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await reconstructPosterWithOpenAI({
      apiKey: 'test-key',
      model: 'test-model',
      request: {
        ...request,
        fontCatalog: {
          entries: [{ id: 'c_brand', label: 'Brand Display' }],
          previewDataUrls: ['data:image/webp;base64,AAAA'],
        },
      },
    });

    expect(result.plan.elements[0]?.fontCatalogId).toBeNull();
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as {
      input: Array<{ role: string; content: Array<{ type: string; image_url?: string; text?: string }> }>;
    };
    const userContent = payload.input.find(({ role }) => role === 'user')?.content ?? [];
    expect(userContent.some(({ text }) => text?.includes('c_brand'))).toBe(true);
    expect(userContent.some(({ image_url }) => image_url === 'data:image/webp;base64,AAAA')).toBe(true);
  });
});

function reconstructionTextElement(fontCatalogId: string | null) {
  return {
    key: 'headline',
    kind: 'text',
    label: 'Headline',
    box: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
    angle: 0,
    opacity: 1,
    zIndex: 1,
    fill: '#111111',
    textFillType: 'solid',
    textFillStart: null,
    textFillEnd: null,
    textFillAngle: 0,
    stroke: null,
    strokeWidthRatio: 0,
    text: 'WE ARE OPEN',
    fontFamily: 'arial',
    fontCatalogId,
    fontSizeRatio: 0.08,
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    charSpacing: 0,
    lineHeight: 1.1,
    visibleLineCount: 1,
    textCurve: 0,
    textEffect: 'flat',
    textHasVisibleExtrusion: false,
    textExtrusionDepthRatio: 0,
    extrusionColor: null,
    cornerRadiusRatio: 0,
    cornerStyle: 'auto',
    pathPoints: [],
    pathUsage: 'not_applicable',
    pathClosed: false,
    pathTension: 0.28,
    imageRole: 'none',
    imageMask: 'none',
    imageCutout: false,
    imageEdge: 'none',
    imageFadeDirection: 'radial',
    imageFadeAmount: 0.35,
    imageFadeMinOpacity: 0,
    imageBrightness: 0,
    imageContrast: 0,
    imageSaturation: 0,
    imageBlur: 0,
    imageTintColor: null,
    imageTintAmount: 0,
    imageHasOverlays: false,
    replacementRecommended: false,
    replacementReason: '',
    imageSearchQuery: '',
    imageDominantColor: null,
    iconName: 'none',
    suggestedFieldKey: null,
    suggestedFieldLabel: '',
    confidence: 0.9,
  };
}
