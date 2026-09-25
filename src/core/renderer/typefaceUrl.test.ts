import { describe, expect, it } from 'vitest';
import { getTypefaceUrl } from './typefaceUrl';

describe('3D typeface URLs', () => {
  it('keeps the recorded typeface mapping for known and fallback fonts', () => {
    expect(getTypefaceUrl('"Dancing Script", cursive')).toBe(
      'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts/gentilis_regular.typeface.json',
    );
    expect(getTypefaceUrl('Arial Black, sans-serif')).toBe(
      'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts/helvetiker_bold.typeface.json',
    );
    expect(getTypefaceUrl('Unknown family')).toBe(
      'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts/helvetiker_regular.typeface.json',
    );
  });
});
