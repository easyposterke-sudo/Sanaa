import { describe, expect, it } from 'vitest';
import type { PosterImageElement } from './types';
import { buildPosterImageReplacement } from './posterImageReplacement';

function imageElement(): PosterImageElement {
  return {
    id: 'image-1',
    type: 'image',
    src: 'old.webp',
    left: 125,
    top: 75,
    scaleX: 0.5,
    scaleY: 0.25,
    angle: 12,
    opacity: 0.8,
    zIndex: 4,
    mask: 'rounded-rect',
    maskImageOffsetX: 0.2,
    adjustBrightness: 15,
    userPosterImageId: 'old-library-link',
  };
}

describe('buildPosterImageReplacement', () => {
  it('keeps displayed width and height when intrinsic dimensions change', () => {
    const updates = buildPosterImageReplacement(
      imageElement(),
      'new.webp',
      { width: 1000, height: 800 },
      { width: 500, height: 1600 },
    );

    expect(updates).toEqual({
      src: 'new.webp',
      scaleX: 1,
      scaleY: 0.125,
      originalSrc: undefined,
      userPosterImageId: undefined,
    });
    expect(500 * (updates.scaleX ?? 0)).toBe(1000 * imageElement().scaleX);
    expect(1600 * (updates.scaleY ?? 0)).toBe(800 * imageElement().scaleY);
  });

  it('does not overwrite position, crop, mask, filters, rotation, or opacity', () => {
    const updates = buildPosterImageReplacement(
      imageElement(),
      'new.webp',
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    );
    expect(updates).not.toHaveProperty('left');
    expect(updates).not.toHaveProperty('top');
    expect(updates).not.toHaveProperty('mask');
    expect(updates).not.toHaveProperty('maskImageOffsetX');
    expect(updates).not.toHaveProperty('adjustBrightness');
    expect(updates).not.toHaveProperty('angle');
    expect(updates).not.toHaveProperty('opacity');
  });
});
