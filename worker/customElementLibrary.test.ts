import { describe, expect, it } from 'vitest';
import {
  cleanCustomElementLabel,
  customElementObjectKey,
  isCustomElementCategory,
  matchesCustomElementSignature,
} from './customElementLibrary';

describe('custom element library helpers', () => {
  it('accepts only supported categories', () => {
    expect(isCustomElementCategory('logos')).toBe(true);
    expect(isCustomElementCategory('people')).toBe(true);
    expect(isCustomElementCategory('unknown')).toBe(false);
  });

  it('cleans labels and scopes object keys to the owner', () => {
    expect(cleanCustomElementLabel('  Church%20Logo\n ', 'fallback')).toBe('Church Logo');
    expect(customElementObjectKey('user@example.com', 'asset-1', 'logo.webp')).toContain(
      'owners/user%40example.com/custom-elements/asset-1/logo.webp',
    );
  });

  it('checks raster signatures', () => {
    expect(matchesCustomElementSignature('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(true);
    expect(matchesCustomElementSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(matchesCustomElementSignature('image/webp', new TextEncoder().encode('RIFFxxxxWEBP'))).toBe(true);
    expect(matchesCustomElementSignature('image/png', new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
