import { afterEach, describe, expect, it, vi } from 'vitest';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION } from '../../shared/ai/posterReconstruction';
import type { PosterElementEditRequest } from '../../shared/ai/posterElementEdit';
import { editPosterElementWithOpenAI } from './openAiPosterElementEditor';

afterEach(() => vi.unstubAllGlobals());

describe('editPosterElementWithOpenAI', () => {
  it('sends the original and current draft and accepts only replacement layers', async () => {
    const patch = {
      schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
      suggestedTemplateName: 'Selected layer edit',
      category: 'general',
      summary: 'Tightened the selected headline.',
      canvas: { backgroundType: 'solid', backgroundTop: '#ffffff', backgroundBottom: '#ffffff', gradientAngle: 0 },
      elements: [replacementText()], warnings: [], confidence: 0.95,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_edit', status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(patch) }] }],
    }), { headers: { 'x-request-id': 'req_edit' } }));
    vi.stubGlobal('fetch', fetchMock);

    const request: PosterElementEditRequest = {
      reference: { dataUrl: 'data:image/webp;base64,AAAA', width: 1080, height: 1350 },
      currentDraft: { dataUrl: 'data:image/webp;base64,BBBB', width: 768, height: 960 },
      instruction: 'Match the original letter spacing.',
      selected: {
        id: 'headline', type: 'text', label: 'SUNDAY',
        box: { x: 0.1, y: 0.2, width: 0.5, height: 0.2 },
        propertiesJson: '{"text":"SUNDAY"}',
      },
    };
    const result = await editPosterElementWithOpenAI({ apiKey: 'test', model: 'test', request });
    expect(result.patch.elements).toHaveLength(1);
    expect(result.openAiRequestId).toBe('req_edit');

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    const userContent = body.input[1].content as Array<{ type: string; image_url?: string }>;
    expect(userContent.filter(({ type }) => type === 'input_image').map(({ image_url }) => image_url)).toEqual([
      request.reference.dataUrl,
      request.currentDraft.dataUrl,
    ]);
    expect(body.input[0].content[0].text).toContain('ONLY replacements for the one selected layer');
    expect(body.input[0].content[0].text).toContain('Set textWidthMode to natural unless');
    expect(body.input[0].content[0].text).toContain('immediately attached ring, oval');
  });
});

function replacementText() {
  return {
    key: 'selected_headline', kind: 'text', label: 'SUNDAY',
    box: { x: 0.1, y: 0.2, width: 0.5, height: 0.2 }, angle: 0, opacity: 1, zIndex: 1,
    fill: '#111111', textFillType: 'solid', textFillStart: null, textFillEnd: null, textFillAngle: 0,
    stroke: null, strokeWidthRatio: 0, text: 'SUNDAY', fontFamily: 'anton', fontCatalogId: null,
    fontSizeRatio: 0.18, fontWeight: '900', fontStyle: 'normal', textAlign: 'left', charSpacing: -40,
    textWidthMode: 'natural', lineHeight: 1, visibleLineCount: 1, textCurve: 0, textEffect: 'flat', textHasVisibleExtrusion: false,
    textExtrusionDepthRatio: 0, extrusionColor: null, cornerRadiusRatio: 0, cornerStyle: 'auto',
    pathPoints: [], pathUsage: 'not_applicable', pathClosed: false, pathTension: 0.28,
    imageRole: 'none', imageMask: 'none', imageCutout: false, imageEdge: 'none', imageFadeDirection: 'radial',
    imageFadeAmount: 0.35, imageFadeMinOpacity: 0, imageBrightness: 0, imageContrast: 0,
    imageSaturation: 0, imageBlur: 0, imageTintColor: null, imageTintAmount: 0, imageHasOverlays: false,
    replacementRecommended: false, replacementReason: '', imageSearchQuery: '', imageDominantColor: null,
    iconName: 'none', suggestedFieldKey: null, suggestedFieldLabel: '', confidence: 0.95,
  };
}
