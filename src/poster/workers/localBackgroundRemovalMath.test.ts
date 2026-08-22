import { describe, expect, it } from 'vitest';
import {
  inspectAlphaMask,
  localModelInputSize,
  normalizeModelMask,
  rgbaToModelTensor,
} from './localBackgroundRemovalMath';

describe('local background-removal model math', () => {
  it('uses the fixed U²-NetP input dimensions', () => {
    expect(localModelInputSize(1200, 800)).toEqual({ width: 320, height: 320 });
    expect(localModelInputSize(800, 1200)).toEqual({ width: 320, height: 320 });
  });

  it('creates a channel-first U²-NetP normalized tensor', () => {
    const pixels = new Uint8ClampedArray([255, 128, 0, 255]);
    const general = rgbaToModelTensor(pixels, 1, 1);

    expect(general[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(general[1]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 6);
    expect(general[2]).toBeCloseTo((0 - 0.406) / 0.225, 6);
  });

  it('min-max normalizes U²-NetP masks', () => {
    expect(Array.from(normalizeModelMask(new Float32Array([2, 4, 6])))).toEqual([
      0,
      128,
      255,
    ]);
  });

  it('detects empty or ineffective masks before they replace the original image', () => {
    expect(inspectAlphaMask(new Uint8ClampedArray([0, 0, 0]))).toEqual({
      minimum: 0,
      maximum: 0,
      foregroundRatio: 0,
    });
    expect(inspectAlphaMask(new Uint8ClampedArray([0, 9, 128, 255]))).toEqual({
      minimum: 0,
      maximum: 255,
      foregroundRatio: 0.75,
    });
  });
});
