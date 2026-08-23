import { describe, expect, it } from 'vitest';
import {
  cleanPosterBackgroundLabel,
  isPosterBackgroundMediaType,
  matchesPosterBackgroundSignature,
  posterBackgroundObjectKey,
} from './backgroundLibrary';

describe('poster background library helpers', () => {
  it('accepts only browser-safe raster formats', () => {
    expect(isPosterBackgroundMediaType('image/png')).toBe(true);
    expect(isPosterBackgroundMediaType('image/jpeg')).toBe(true);
    expect(isPosterBackgroundMediaType('image/webp')).toBe(true);
    expect(isPosterBackgroundMediaType('image/svg+xml')).toBe(false);
  });

  it('validates image signatures', () => {
    expect(
      matchesPosterBackgroundSignature(
        'image/png',
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(matchesPosterBackgroundSignature('image/jpeg', Uint8Array.from([1, 2, 3]))).toBe(
      false,
    );
  });

  it('cleans labels and produces owner-scoped R2 keys', () => {
    expect(cleanPosterBackgroundLabel('Sunday%20Gold', 'fallback')).toBe('Sunday Gold');
    expect(cleanPosterBackgroundLabel('', 'blue-paper.jpg')).toBe('blue-paper.jpg');
    expect(posterBackgroundObjectKey('owner@example.com', 'bg-1', 'paper gold.jpg')).toBe(
      'owners/owner%40example.com/backgrounds/bg-1/paper%20gold.jpg',
    );
  });
});
