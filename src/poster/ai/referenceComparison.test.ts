import { describe, expect, it } from 'vitest';
import { compareReferencePixels, isReferenceImprovement, referenceComparisonRegions } from './referenceComparison';
import { referenceElement, referencePlan } from './referenceTestFixtures';
import { referenceCanvasSize } from './referenceCanvasSize';

function pixels(value: number) { return { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(value) }; }

describe('reference visual acceptance', () => {
  it('scales both original dimensions together', () => {
    expect(referenceCanvasSize(6000, 8000)).toEqual({ width: 3072, height: 4096 });
    expect(referenceCanvasSize(800, 1000)).toEqual({ width: 800, height: 1000 });
  });
  it('prefers an actual rendered improvement and rejects an unchanged or worse render', () => {
    const region = [referenceElement()];
    const target = pixels(255);
    const before = compareReferencePixels(target, pixels(100), region, []);
    const after = compareReferencePixels(target, target, region, []);
    expect(after.error).toBe(0);
    expect(isReferenceImprovement(before, after)).toBe(true);
    expect(isReferenceImprovement(after, before)).toBe(false);
    expect(isReferenceImprovement(before, before)).toBe(false);
  });
  it('does not let a better large region hide a damaged small text region', () => {
    const before = { error: .2, regions: [{ key: 'large', error: .3, samples: 9999 }, { key: 'small', error: .1, samples: 20 }] };
    const after = { error: .15, regions: [{ key: 'large', error: 0, samples: 9999 }, { key: 'small', error: .3, samples: 20 }] };
    expect(isReferenceImprovement(before, after)).toBe(false);
  });
  it('excludes foreground photos and 3D without excluding text over a background photo', () => {
    const region = referenceElement({ zIndex: 2 });
    const photo = referenceElement({ key: 'photo', kind: 'image_region', imageRole: 'background_photo', box: { x: 0, y: 0, width: 1, height: 1 }, zIndex: 3 });
    expect(compareReferencePixels(pixels(255), pixels(0), [region], [photo]).regions).toEqual([]);
    expect(compareReferencePixels(pixels(255), pixels(0), [region], [{ ...photo, zIndex: 1 }]).regions).toHaveLength(1);
    expect(compareReferencePixels(pixels(255), pixels(0), [photo], []).regions).toEqual([]);
  });
  it('compares both drafts over identical union bounds', () => {
    const old = referencePlan([referenceElement({ box: { x: .1, y: .1, width: .2, height: .2 } })]);
    const changed = referencePlan([referenceElement({ box: { x: .4, y: .3, width: .2, height: .2 } })]);
    const [region] = referenceComparisonRegions(old, changed);
    expect(region!.box.x).toBe(.1);
    expect(region!.box.width).toBeCloseTo(.5);
    expect(region!.box.height).toBeCloseTo(.4);
    expect(() => compareReferencePixels(pixels(0), { ...pixels(0), width: 20 }, [], [])).toThrow();
  });
});
