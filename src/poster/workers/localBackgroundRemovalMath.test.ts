import { describe, expect, it } from 'vitest';
import {
  inspectAlphaMask,
  localModelInputSize,
  normalizeModelMask,
  rgbaToModelTensor,
} from './localBackgroundRemovalMath';

describe('local background-removal model math', () => {
  it('keeps portrait input aspect ratio while bounding both dimensions', () => {
    expect(localModelInputSize('portrait', 1200, 800)).toEqual({ width: 768, height: 512 });
    expect(localModelInputSize('portrait', 800, 1200)).toEqual({ width: 512, height: 768 });
    expect(localModelInputSize('general', 1200, 800)).toEqual({ width: 320, height: 320 });
  });

  it('creates channel-first normalized tensors for each model family', () => {
    const pixels = new Uint8ClampedArray([255, 128, 0, 255]);
    const portrait = rgbaToModelTensor(pixels, 1, 1, 'portrait');
    const general = rgbaToModelTensor(pixels, 1, 1, 'general');

    expect(Array.from(portrait)).toEqual([1, expect.closeTo(128 / 127.5 - 1, 6), -1]);
    expect(general[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(general[1]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 6);
    expect(general[2]).toBeCloseTo((0 - 0.406) / 0.225, 6);
  });

  it('min-max normalizes general masks but preserves portrait alpha values', () => {
    expect(Array.from(normalizeModelMask(new Float32Array([2, 4, 6]), 'general'))).toEqual([
      0,
      128,
      255,
    ]);
    expect(Array.from(normalizeModelMask(new Float32Array([-1, 0.5, 2]), 'portrait'))).toEqual([
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
