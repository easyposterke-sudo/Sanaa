import { describe, expect, it } from 'vitest';
import { reconstructionFontCatalogId } from './prepareReconstructionFontCatalog';

describe('reconstruction custom font catalogue IDs', () => {
  it('creates stable opaque IDs accepted by the reconstruction schema', () => {
    const first = reconstructionFontCatalogId('cloud-font-1234');
    expect(first).toBe(reconstructionFontCatalogId('cloud-font-1234'));
    expect(first).toMatch(/^c_[a-z0-9_]{1,40}$/);
    expect(first).not.toBe(reconstructionFontCatalogId('cloud-font-5678'));
  });
});
