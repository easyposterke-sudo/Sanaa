import { describe, expect, it } from 'vitest';
import { isPosterFontWeightBold } from './textFontStyle';

describe('poster text font styles', () => {
  it('recognizes named and AI-generated heavy weights as bold', () => {
    expect(isPosterFontWeightBold('bold')).toBe(true);
    expect(isPosterFontWeightBold('700')).toBe(true);
    expect(isPosterFontWeightBold(800)).toBe(true);
    expect(isPosterFontWeightBold('900')).toBe(true);
  });

  it('keeps normal and medium weights unbolded', () => {
    expect(isPosterFontWeightBold(undefined)).toBe(false);
    expect(isPosterFontWeightBold('normal')).toBe(false);
    expect(isPosterFontWeightBold('600')).toBe(false);
  });
});
