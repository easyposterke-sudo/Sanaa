import { describe, expect, it } from 'vitest';
import { computeMaskBakeGeometry, computeMaskPreviewSize } from './bakeMaskedImage';

describe('computeMaskBakeGeometry', () => {
  it('keeps transparent margins when a circle is larger than the image', () => {
    const geometry = computeMaskBakeGeometry(
      400,
      400,
      'circle',
      0.5,
      0.5,
      0.6,
      1.5,
      2,
      540,
      340
    );

    expect(geometry.sourceX).toBe(0);
    expect(geometry.sourceY).toBe(0);
    expect(geometry.sourceW).toBe(400);
    expect(geometry.sourceH).toBe(400);
    expect(geometry.destX).toBeGreaterThan(0);
    expect(geometry.destY).toBeGreaterThan(0);
    expect(geometry.destX + geometry.destW).toBeLessThan(geometry.outW);
    expect(geometry.destY + geometry.destH).toBeLessThan(geometry.outH);
    expect(geometry.outW).toBe(geometry.outH);
  });

  it('preserves an off-centre mask instead of shifting the crop back over the image', () => {
    const geometry = computeMaskBakeGeometry(
      800,
      600,
      'circle',
      0,
      0.5,
      1,
      1,
      2,
      540,
      340
    );

    expect(geometry.sourceX).toBe(0);
    expect(geometry.destX).toBeGreaterThan(0);
    expect(geometry.sourceW).toBeLessThan(800);
  });

  it('caps oversized output canvases while preserving aspect ratio', () => {
    const geometry = computeMaskBakeGeometry(
      16_000,
      9_000,
      'ellipse',
      0.5,
      0.5,
      0.6,
      1.5,
      2,
      540,
      340
    );

    expect(geometry.outW).toBeLessThanOrEqual(4096);
    expect(geometry.outH).toBeLessThanOrEqual(4096);
    expect(geometry.outW * geometry.outH).toBeLessThanOrEqual(12_000_000);
    const preview = computeMaskPreviewSize('ellipse', 1.5, 540, 340);
    expect(geometry.outW / geometry.outH).toBeCloseTo(preview.w / preview.h, 2);
  });

  it('keeps a circle square when it reaches the stage boundary', () => {
    expect(computeMaskPreviewSize('circle', 1.5, 540, 340)).toEqual({
      w: 323,
      h: 323,
    });
  });
});
