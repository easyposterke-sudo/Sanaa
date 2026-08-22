import { describe, expect, it } from 'vitest';
import { cleanFontLabel, detectFontFormat, fontObjectKey } from './fontLibrary';

describe('font library validation', () => {
  it('accepts matching TrueType and OpenType signatures', () => {
    expect(detectFontFormat('family.ttf', new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe('ttf');
    expect(detectFontFormat('family.otf', new TextEncoder().encode('OTTO'))).toBe('otf');
  });

  it('rejects renamed and unsupported font files', () => {
    expect(detectFontFormat('fake.ttf', new TextEncoder().encode('OTTO'))).toBeNull();
    expect(detectFontFormat('family.woff', new TextEncoder().encode('wOFF'))).toBeNull();
  });

  it('sanitizes labels and only creates keys for UUIDs', () => {
    expect(cleanFontLabel('  My\n Font  ', 'Fallback')).toBe('My Font');
    expect(fontObjectKey('4c8de300-349d-4a7c-befe-e3930912760d')).toBe(
      'font-library/4c8de300-349d-4a7c-befe-e3930912760d',
    );
    expect(fontObjectKey('../other-object')).toBeNull();
  });
});

