import { describe, expect, it } from 'vitest';
import { findMissingTemplateTextFields } from './missingTemplateDetails';

describe('missing template details', () => {
  it('returns only empty text fields and keeps image fields optional', () => {
    const fields = [
      { key: 'church_name', label: 'Church name', sourceElementId: 'a', kind: 'text' as const },
      { key: 'time', label: 'Service time', sourceElementId: 'b', kind: 'text' as const },
      { key: 'guest_photo', label: 'Guest image', sourceElementId: 'c', kind: 'image' as const },
    ];
    expect(
      findMissingTemplateTextFields({ fields }, { church_name: '', time: '10:00 AM' }),
    ).toEqual([fields[0]]);
  });
});
