import { describe, expect, it } from 'vitest';
import { shouldUsePosterRetinaScaling } from './posterCanvasResolution';

describe('interactive poster canvas resolution', () => {
  it('avoids an oversized phone backing store only when design pixels cover the display', () => {
    expect(shouldUsePosterRetinaScaling(360, 1 / 3, 3)).toBe(false);
    expect(shouldUsePosterRetinaScaling(360, 0.5, 3)).toBe(true);
    expect(shouldUsePosterRetinaScaling(360, 0.5, 1)).toBe(false);
  });

  it('preserves desktop retina rendering', () => {
    expect(shouldUsePosterRetinaScaling(1024, 0.25, 3)).toBe(true);
  });
});
