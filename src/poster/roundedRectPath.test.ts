import { describe, expect, it } from 'vitest';
import type { PosterShapeElement } from './types';
import {
  normalizeRectScaleToDimensions,
  perCornerRadiiFromShape,
  roundedRectPathD,
} from './roundedRectPath';

function rectangle(
  overrides: Partial<PosterShapeElement> = {}
): PosterShapeElement & { type: 'rect' } {
  return {
    id: 'rect-1',
    type: 'rect',
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    zIndex: 1,
    width: 120,
    height: 80,
    rx: 22,
    fill: '#6366f1',
    ...overrides,
  } as PosterShapeElement & { type: 'rect' };
}

describe('normalizeRectScaleToDimensions', () => {
  it('absorbs horizontal scaling without changing pixel corner radii', () => {
    const shape = rectangle();
    const resized = normalizeRectScaleToDimensions(shape, 4, 1);
    expect(resized).toEqual({
      width: 480,
      height: 80,
      scaleX: 1,
      scaleY: 1,
    });
    expect(shape.rx).toBe(22);
    expect(
      roundedRectPathD(resized.width, resized.height, 22, 22, 22, 22)
    ).toContain('A 22 22');
  });

  it('preserves flip direction while removing scale magnitude', () => {
    expect(normalizeRectScaleToDimensions(rectangle(), -2, 0.5)).toEqual({
      width: 240,
      height: 40,
      scaleX: -1,
      scaleY: 1,
    });
  });

  it('keeps independent corner radii circular after resizing', () => {
    const shape = rectangle({
      width: 100,
      height: 60,
      rectCornerRadii: { tl: 8, tr: 14, br: 20, bl: 4 },
    });
    const resized = normalizeRectScaleToDimensions(shape, 3, 1);
    const resizedShape = { ...shape, ...resized };
    expect(perCornerRadiiFromShape(resizedShape)).toEqual({
      tl: 8,
      tr: 14,
      br: 20,
      bl: 4,
    });
    expect(
      roundedRectPathD(
        resized.width,
        resized.height,
        8,
        14,
        20,
        4
      )
    ).toContain('A 14 14');
  });

  it('clamps corners when a rectangle becomes smaller than its radius', () => {
    const shape = rectangle({ width: 120, height: 80, rx: 30 });
    const resized = normalizeRectScaleToDimensions(shape, 0.1, 0.25);
    expect(resized).toMatchObject({ width: 12, height: 20 });
    expect(perCornerRadiiFromShape({ ...shape, ...resized })).toEqual({
      tl: 6,
      tr: 6,
      br: 6,
      bl: 6,
    });
  });
});
