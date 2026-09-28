import { describe, expect, it } from 'vitest';
import { elementEditDetailBox } from './elementEditPreview';

describe('selected-layer detail mapping', () => {
  it('includes both the old and moved geometry with context inside the poster', () => {
    const box = elementEditDetailBox([{ x: .1, y: .2, width: .2, height: .1 }, { x: .6, y: .7, width: .5, height: .4 }]);
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo(.065);
    expect(box.x + box.width).toBe(1);
    expect(box.y + box.height).toBe(1);
  });
  it('keeps a usable clipped detail for an off-canvas selection', () => {
    const box = elementEditDetailBox([{ x: 1.2, y: -1, width: .1, height: .1 }]);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y).toBe(0);
  });
});
