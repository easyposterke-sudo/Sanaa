import { describe, expect, it } from 'vitest';
import {
  MAX_LOCAL_BLUR_RADIUS,
  brushRadiiInImagePixels,
  getLocalizedBlurRadius,
  pointTouchesImage,
  scenePointToImagePixel,
} from './localizedBlurBrush';

describe('localized blur brush geometry', () => {
  it('converts scene coordinates into source-image pixels', () => {
    expect(
      scenePointToImagePixel(
        { x: 100, y: 100 },
        [2, 0, 0, 2, 100, 100],
        200,
        100
      )
    ).toEqual({ x: 100, y: 50 });
    expect(
      scenePointToImagePixel(
        { x: 300, y: 200 },
        [2, 0, 0, 2, 100, 100],
        200,
        100
      )
    ).toEqual({ x: 200, y: 100 });
  });

  it('supports flipped transforms and rejects singular transforms', () => {
    expect(
      scenePointToImagePixel(
        { x: 50, y: 50 },
        [-1, 0, 0, 1, 50, 50],
        100,
        100
      )
    ).toEqual({ x: 50, y: 50 });
    expect(
      scenePointToImagePixel({ x: 0, y: 0 }, [0, 0, 0, 0, 0, 0], 100, 100)
    ).toBeNull();
  });

  it('keeps a circular scene brush accurate on non-uniform image scaling', () => {
    expect(brushRadiiInImagePixels([2, 0, 0, 4, 0, 0], 80)).toEqual({
      radiusX: 20,
      radiusY: 10,
    });
  });

  it('recognizes strokes that overlap an image edge', () => {
    expect(pointTouchesImage({ x: -5, y: 30 }, 100, 80, 10, 10)).toBe(true);
    expect(pointTouchesImage({ x: -20, y: 30 }, 100, 80, 10, 10)).toBe(false);
  });

  it('scales and caps localized blur strength', () => {
    expect(getLocalizedBlurRadius(1000, 500, 40)).toBe(5);
    expect(getLocalizedBlurRadius(10_000, 10_000, 100)).toBe(
      MAX_LOCAL_BLUR_RADIUS
    );
    expect(getLocalizedBlurRadius(1000, 500, 0)).toBe(0);
  });
});
