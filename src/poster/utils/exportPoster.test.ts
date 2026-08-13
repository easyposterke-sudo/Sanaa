import { describe, expect, it } from 'vitest';
import {
  MAX_EXPORT_DIMENSION,
  MAX_EXPORT_PIXELS,
  getPosterExportPlan,
} from './exportPoster';

describe('getPosterExportPlan', () => {
  it('allows an 8x export when it stays within the browser budget', () => {
    const plan = getPosterExportPlan(800, 600, 8);
    expect(plan).toMatchObject({
      width: 6400,
      height: 4800,
      pixels: 30_720_000,
      safe: true,
    });
  });

  it('blocks exports that would create too many pixels', () => {
    const plan = getPosterExportPlan(1080, 1920, 8);
    expect(plan.safe).toBe(false);
    expect(plan.pixels).toBeGreaterThan(MAX_EXPORT_PIXELS);
    expect(plan.reason).toContain('freeze');
  });

  it('blocks exports beyond the safe browser dimension', () => {
    const plan = getPosterExportPlan(4000, 4000, 8);
    expect(plan.safe).toBe(false);
    expect(plan.width).toBeGreaterThan(MAX_EXPORT_DIMENSION);
  });

  it('rejects invalid dimensions and scales', () => {
    expect(getPosterExportPlan(0, 600, 2).safe).toBe(false);
    expect(getPosterExportPlan(800, 600, 0).safe).toBe(false);
  });
});
