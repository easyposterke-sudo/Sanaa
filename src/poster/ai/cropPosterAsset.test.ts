import { describe, expect, it } from 'vitest';
import { polygonCropBounds } from './cropPosterAsset';

describe('polygonCropBounds', () => {
  it('places a traced asset using the outline bounds', () => {
    expect(polygonCropBounds([
      { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.4 }, { x: 0.4, y: 0.8 },
    ])).toEqual({ x: 0.2, y: 0.3, width: 0.3, height: 0.5 });
  });

  it('requires a closed shape with at least three anchors', () => {
    expect(() => polygonCropBounds([{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.4 }])).toThrow('at least three');
  });
});
