import { describe, expect, it } from 'vitest';
import { moveNormalizedCrop, resizeNormalizedCrop, zoomForCrop } from './posterAssetCropGeometry';

describe('poster asset crop controls', () => {
  const crop = { x: 0.4, y: 0.3, width: 0.2, height: 0.1 };

  it('zooms a tiny detected icon into an editable region', () => {
    expect(zoomForCrop({ x: 0.7, y: 0.5, width: 0.02, height: 0.02 }, 3000, 2000, 0.25)).toBe(15);
    expect(zoomForCrop(crop, 3000, 2000, 0.5)).toBe(2);
  });

  it('moves a selection without changing its size or leaving the poster', () => {
    expect(moveNormalizedCrop(crop, 0.9, -0.9)).toEqual({ x: 0.8, y: 0, width: 0.2, height: 0.1 });
  });

  it('resizes rectangle and ellipse bounds from corners and side handles', () => {
    const corner = resizeNormalizedCrop(crop, 'nw', -0.1, -0.1, 0.01, 0.01);
    expect(corner.x).toBeCloseTo(0.3);
    expect(corner.y).toBeCloseTo(0.2);
    expect(corner.width).toBeCloseTo(0.3);
    expect(corner.height).toBeCloseTo(0.2);
    const side = resizeNormalizedCrop(crop, 'e', 0.1, 0.5, 0.01, 0.01);
    expect(side.width).toBeCloseTo(0.3);
    expect(side.height).toBeCloseTo(0.1);
    const smallest = resizeNormalizedCrop(crop, 'w', 0.3, 0, 0.01, 0.01);
    expect(smallest.width).toBeCloseTo(0.01);
    expect(smallest.x + smallest.width).toBeCloseTo(0.6);
  });
});
