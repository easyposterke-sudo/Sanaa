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
    const payload = JSON.parse(String(options.body)) as {
      max_output_tokens?: number;
      store?: boolean;
      input: Array<{ content: Array<{ text?: string }> }>;
    };
    expect(payload.max_output_tokens).toBe(POSTER_RECONSTRUCTION_MAX_OUTPUT_TOKENS);
    expect(payload.store).toBe(false);
    expect(payload.input[0]?.content[0]?.text).toContain('Use natural by default');
    expect(payload.input[0]?.content[0]?.text).toContain('one indivisible brand mark');
  });

  it('sends small asset analysis images without a blank reference, then merges a patch review', async () => {
    const responsePlan = {
      schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION, suggestedTemplateName:'Test', category:'church', summary:'Draft',
      canvas:{backgroundType:'solid',backgroundTop:'#ffffff',backgroundBottom:'#ffffff',gradientAngle:0},
      elements:[reconstructionTextElement(null)], warnings:[], confidence:.9,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(responsePlan)}]}]})));
    vi.stubGlobal('fetch',fetchMock);
    const creation = {prompt:'A church service poster',seed:'test',referenceId:1,phase:'design' as const,assets:[{role:'person' as const,dataUrl:'data:image/webp;base64,AAAA',width:600,height:1000}]};
    const first = await reconstructPosterWithOpenAI({apiKey:'test',model:'test',request:{...request,creation}});
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(firstBody.input[1].content.filter((item: {type:string}) => item.type === 'input_image')).toEqual([{type:'input_image',image_url:creation.assets[0]!.dataUrl,detail:'low'}]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Reviewed',upsert:[],removeKeys:[],canvas:null})}]}]})));
    const reviewed = await reconstructPosterWithOpenAI({apiKey:'test',model:'test',request:{...request,creation:{...creation,phase:'review',responseMode:'patch',previousPlan:first.plan,assets:[{role:'person',width:600,height:1000}]}}});
    expect(reviewed.plan.elements).toEqual(first.plan.elements);
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(secondBody.input[1].content.filter((item: {type:string}) => item.type === 'input_image')).toHaveLength(1);
    expect(secondBody.text.format.schema.required).toContain('upsert');
  });

  it('keeps the timeout active while reading a stalled response body', async () => {
    vi.stubGlobal('fetch',vi.fn(async (_url: string, options?: RequestInit) => new Response(new ReadableStream({
      start(controller) { options?.signal?.addEventListener('abort', () => controller.error(new Error('aborted'))); },
    }))));
    await expect(reconstructPosterWithOpenAI({apiKey:'test',model:'test',request,timeoutMs:10})).rejects.toMatchObject({code:'AI_TIMEOUT'});
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
    textWidthMode: 'natural',
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
