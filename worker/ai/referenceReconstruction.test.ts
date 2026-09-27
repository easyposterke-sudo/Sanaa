import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconstructPosterWithOpenAI } from './openAiPosterReconstructor';
import { referenceElement, referencePlan } from '../../src/poster/ai/referenceTestFixtures';
import { EMPTY_REFERENCE_FIDELITY } from '../../shared/ai/referenceFidelity';
import type { PosterReconstructionRequest } from '../../shared/ai/posterReconstruction';

afterEach(() => vi.unstubAllGlobals());
const request: PosterReconstructionRequest = { quality: 'quality', reference: { dataUrl: 'data:image/png;base64,AAAA', width: 1000, height: 1000 } };
function respond(value: unknown) {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
describe('reference reconstruction provider integration', () => {
  it('sends mapped detail crops and expands the compact reference response', async () => {
    const compact = { key: 'title', kind: 'text', label: 'Title', box: { x: .1, y: .1, width: .8, height: .2 }, angle: 0, opacity: 1, zIndex: 1, confidence: .9, text: 'SUNDAY', fontFamily: 'arial', fontSizeRatio: .1, fidelity: { ...EMPTY_REFERENCE_FIDELITY } };
    const fetchMock = respond({ ...referencePlan(), elements: [compact] });
    const crop = { box: { x: .45, y: 0, width: .55, height: .55 }, dataUrl: 'data:image/webp;base64,AAAA' };
    const result = await reconstructPosterWithOpenAI({ apiKey: 'test', model: 'test', request: { ...request, detailCrops: [crop] } });
    expect(result.plan.elements[0]).toMatchObject({ text: 'SUNDAY', imageRole: 'none', fidelity: EMPTY_REFERENCE_FIDELITY });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(payload.text.format.schema.properties.elements.maxItems).toBe(120);
    expect(payload.input[1].content).toContainEqual({ type: 'input_image', image_url: crop.dataUrl, detail: 'high' });
    expect(JSON.stringify(payload.input[1].content)).toContain('0.45');
  });

  it('merges reference corrections without losing original fonts, images or 3D', async () => {
    const text = referenceElement({ key: 'title', kind: 'text', fontCatalogId: 'c_saved' });
    const previousPlan = referencePlan([text, referenceElement({ key: 'speaker', kind: 'image_region', imageRole: 'person' }), referenceElement({ key: 'depth', kind: 'text', textEffect: 'two_layer_3d' })]);
    const snapshot = JSON.stringify(previousPlan);
    const fetchMock = respond({ summary: 'Rotation corrected', upsert: [{ ...text, angle: -5 }], canvas: null });
    const result = await reconstructPosterWithOpenAI({ apiKey: 'test', model: 'test', request: { ...request, referenceReview: { previousPlan, draftDataUrl: 'data:image/webp;base64,BBBB', feedback: [] } } });
    expect(result.plan.elements[0]).toMatchObject({ angle: -5, fontCatalogId: 'c_saved' });
    expect(result.plan.elements.slice(1)).toEqual(previousPlan.elements.slice(1));
    expect(JSON.stringify(previousPlan)).toBe(snapshot);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(payload.text.format.schema.required).toEqual(['summary', 'upsert', 'canvas']);
    expect(payload.input[1].content.filter((item: { type: string }) => item.type === 'input_image')).toHaveLength(2);
  });

  it('rejects provider corrections that rewrite confirmed text', async () => {
    const text = referenceElement({ kind: 'text', text: '31ST DEC, 2026' });
    respond({ summary: 'Changed wording', upsert: [{ ...text, text: '1ST JAN, 2027' }], canvas: null });
    await expect(reconstructPosterWithOpenAI({ apiKey: 'test', model: 'test', request: { ...request, referenceReview: { previousPlan: referencePlan([text]), draftDataUrl: 'data:image/webp;base64,BBBB', feedback: [] } } })).rejects.toMatchObject({ code: 'AI_INVALID_PLAN' });
  });
});
