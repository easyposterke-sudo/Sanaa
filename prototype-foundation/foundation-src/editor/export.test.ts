import { describe, expect, it } from 'vitest';
import { planBrowserExport } from './export';

describe('browser export planning', () => {
  it('allows a safe small render', () => {
    expect(planBrowserExport(1080, 1350, 2)).toMatchObject({
      width: 2160,
      height: 2700,
      allowed: true,
    });
  });

  it('blocks unsafe 8x rendering before allocating a canvas', () => {
    const plan = planBrowserExport(1080, 1350, 8);
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toMatch(/cloud renderer/i);
  });
});
