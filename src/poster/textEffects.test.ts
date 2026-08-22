import { describe, expect, it } from 'vitest';
import { buildPosterTextEffectStyles, posterTextEffectPadding } from './textEffects';

describe('poster text effects', () => {
  it('returns no character overrides for straight, even text', () => {
    expect(buildPosterTextEffectStyles('POSTER', 40, 0, 0)).toEqual({});
  });

  it('curves the middle characters upward or downward', () => {
    const upward = buildPosterTextEffectStyles('ABCDE', 40, 50, 0);
    const downward = buildPosterTextEffectStyles('ABCDE', 40, -50, 0);
    expect(upward[0]?.[0]?.deltaY).toBe(0);
    expect(upward[0]?.[2]?.deltaY).toBe(-25);
    expect(downward[0]?.[2]?.deltaY).toBe(25);
    expect(posterTextEffectPadding(40, -50)).toBe(25);
  });

  it('tapers each line from large to small and can reverse direction', () => {
    const forward = buildPosterTextEffectStyles('ABC\nXYZ', 40, 0, 50);
    const reverse = buildPosterTextEffectStyles('ABC', 40, 0, -50);
    expect(forward[0]?.[0]?.fontSize).toBe(60);
    expect(forward[0]?.[2]?.fontSize).toBe(20);
    expect(forward[1]?.[0]?.fontSize).toBe(60);
    expect(forward[1]?.[2]?.fontSize).toBe(20);
    expect(reverse[0]?.[0]?.fontSize).toBe(20);
    expect(reverse[0]?.[2]?.fontSize).toBe(60);
  });

  it('clamps extreme values to safe effect limits', () => {
    const styles = buildPosterTextEffectStyles('ABC', 40, 1000, 1000);
    expect(styles[0]?.[1]?.deltaY).toBe(-50);
    expect(styles[0]?.[0]?.fontSize).toBe(68);
    expect(styles[0]?.[2]?.fontSize).toBe(12);
  });
});
