import { describe, expect, it } from 'vitest';
import type { Poster3DTextElement } from './types';
import { computeUniform3DTextReplacement, findVisibleAlphaBounds } from './threeTextHandoff';

function element(overrides: Partial<Poster3DTextElement> = {}): Poster3DTextElement {
  return {
    id: '3d-title',
    type: '3d-text',
    image: 'data:image/webp;base64,AA==',
    config: {},
    left: 20,
    top: 30,
    scaleX: 0.5,
    scaleY: 0.5,
    angle: 0,
    opacity: 1,
    zIndex: 1,
    ...overrides,
  };
}

describe('findVisibleAlphaBounds', () => {
  it('returns the exact non-transparent rectangle', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[(1 * 4 + 1) * 4 + 3] = 255;
    pixels[(2 * 4 + 3) * 4 + 3] = 128;
    expect(findVisibleAlphaBounds(pixels, 4, 4)).toEqual({
      left: 1,
      top: 1,
      right: 3,
      bottom: 2,
    });
  });
});

describe('computeUniform3DTextReplacement', () => {
  it('preserves displayed width, centres the new height, and never squashes the raster', () => {
    const result = computeUniform3DTextReplacement(
      element(),
      { width: 1000, height: 250 },
      { width: 600, height: 200 },
    );

    expect(result.scaleX).toBe(0.3);
    expect(result.scaleY).toBe(0.3);
    expect(result.previewWidth * result.scaleX).toBe(300);
    expect(result.previewHeight * result.scaleY).toBe(75);
    expect(result.top).toBe(42.5);
  });
});
