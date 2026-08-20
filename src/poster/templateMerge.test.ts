import { describe, expect, it } from 'vitest';
import {
  compileTwoLayer3DTextState,
  renderTwoLayer3DTextPreview,
} from './ai/twoLayer3DTextSkill';
import { applyFieldBindings } from './templateMerge';
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
    expect(updated.config.textLayers?.every((layer) => layer.text?.content === 'CONFERENCE')).toBe(true);
    expect(updated.image).toContain('CONFERENCE');
    expect((updated.previewWidth ?? 0) * updated.scaleX).toBeCloseTo(originalSize.width * 0.8);
    expect((updated.previewHeight ?? 0) * updated.scaleY).toBeCloseTo(originalSize.height * 0.8);
  });
});

