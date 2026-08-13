import { describe, expect, it } from 'vitest';
import {
  FastCanvasBlurFilter,
  MAX_FAST_BLUR_RADIUS,
  getFastCanvasBlurRadius,
} from './fastCanvasBlur';
import { buildImageAdjustmentFilters } from './imageEffects';

describe('getFastCanvasBlurRadius', () => {
  it('scales blur relative to the shorter image dimension', () => {
    expect(getFastCanvasBlurRadius(1000, 500, 0.5)).toBe(12.5);
  });

  it('clamps invalid amounts and very large radii', () => {
    expect(getFastCanvasBlurRadius(1000, 500, -1)).toBe(0);
    expect(getFastCanvasBlurRadius(10_000, 10_000, 2)).toBe(MAX_FAST_BLUR_RADIUS);
    expect(getFastCanvasBlurRadius(0, 500, 0.5)).toBe(0);
  });
});

describe('buildImageAdjustmentFilters', () => {
  it('uses the optimized canvas blur filter', () => {
    const filters = buildImageAdjustmentFilters({ adjustBlur: 50 });
    expect(filters).toHaveLength(1);
    expect(filters[0]).toBeInstanceOf(FastCanvasBlurFilter);
  });

  it('omits neutral blur values', () => {
    expect(buildImageAdjustmentFilters({ adjustBlur: 0 })).toHaveLength(0);
  });
});
