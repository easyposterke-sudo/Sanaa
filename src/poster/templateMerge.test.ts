import { describe, expect, it } from 'vitest';
import {
  compileTwoLayer3DTextState,
  renderTwoLayer3DTextPreview,
} from './ai/twoLayer3DTextSkill';
import { applyFieldBindings, instantiateTemplate } from './templateMerge';
import type { Poster3DTextElement } from './types';

function svgSize(svg: string): { width: number; height: number } {
  return {
    width: Number(svg.match(/\bwidth="([0-9.]+)"/)?.[1]),
    height: Number(svg.match(/\bheight="([0-9.]+)"/)?.[1]),
  };
}

describe('applyFieldBindings', () => {
  it('replaces two-layer 3D wording and preserves its poster bounds', () => {
    const config = compileTwoLayer3DTextState({
      text: "MEN'S",
      faceColor: '#f4efe3',
      extrusionColor: '#176143',
    });
    const originalSvg = renderTwoLayer3DTextPreview(config);
    const originalSize = svgSize(originalSvg);
    const element: Poster3DTextElement = {
      id: 'new-title-id',
      type: '3d-text',
      image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(originalSvg)}`,
      config,
      previewWidth: originalSize.width,
      previewHeight: originalSize.height,
      left: 100,
      top: 120,
      scaleX: 0.8,
      scaleY: 0.8,
      angle: 0,
      opacity: 1,
      zIndex: 4,
    };

    const [updated] = applyFieldBindings(
      [element],
      [{ key: 'event_title', label: 'Event title', sourceElementId: 'saved-title-id', kind: 'text' }],
      { 'saved-title-id': 'new-title-id' },
      { event_title: 'CONFERENCE' },
    );

    expect(updated?.type).toBe('3d-text');
    if (updated?.type !== '3d-text') throw new Error('Expected 3D text.');
    expect(updated.config.text?.content).toBe('CONFERENCE');
    expect(updated.config.textLayers?.every((layer) => 'text' in layer && layer.text?.content === 'CONFERENCE')).toBe(true);
    expect(updated.image).toContain('CONFERENCE');
    expect((updated.previewWidth ?? 0) * updated.scaleX).toBeCloseTo(originalSize.width * 0.8);
    expect((updated.previewHeight ?? 0) * updated.scaleY).toBeCloseTo(originalSize.height * 0.8);
  });
});

describe('instantiateTemplate AI clearing', () => {
  it('clears the entire bound text layer when an AI field is missing', async () => {
    const result = await instantiateTemplate(
      {
        id: 'template-1',
        name: 'Event',
        category: 'event',
        fields: [
          { key: 'guest_name', label: 'Guest name', sourceElementId: 'guest' },
        ],
        project: {
          canvasWidth: 800,
          canvasHeight: 600,
          elements: [
            {
              id: 'guest',
              type: 'text',
              left: 10,
              top: 10,
              text: 'Guest: {{guest_name}}',
              fontSize: 20,
              fontFamily: 'Arial',
              fill: '#000000',
              scaleX: 1,
              scaleY: 1,
              angle: 0,
              opacity: 1,
              zIndex: 1,
            },
          ],
        },
      },
      { guest_name: '' },
      { clearMissingTextFields: true },
    );

    expect(result.project.elements[0]).toMatchObject({ type: 'text', text: '', opacity: 0, width: 742 });
  });

  it('hides a missing optional 3D text field instead of leaving template wording visible', async () => {
    const config = compileTwoLayer3DTextState({
      text: 'OTHER DETAILS',
      faceColor: '#ffffff',
      extrusionColor: '#111111',
    });
    const result = await instantiateTemplate(
      {
        id: 'template-3d',
        name: 'Event',
        category: 'event',
        fields: [{ key: 'other_details', label: 'Other details', sourceElementId: 'details' }],
        project: {
          canvasWidth: 800,
          canvasHeight: 600,
          elements: [{
            id: 'details',
            type: '3d-text',
            image: 'data:image/png;base64,placeholder',
            config,
            left: 10,
            top: 10,
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            opacity: 1,
            zIndex: 1,
          }],
        },
      },
      { other_details: '' },
      { clearMissingTextFields: true },
    );
    expect(result.project.elements[0]).toMatchObject({ type: '3d-text', opacity: 0 });
  });
});
