import { describe, expect, it } from 'vitest';
import {
  TemplatePosterRequestSchema,
  createFallbackTemplatePosterSelection,
  validateTemplatePosterSelection,
  type TemplatePosterRequest,
} from '../shared/ai/templatePoster';

const request: TemplatePosterRequest = TemplatePosterRequestSchema.parse({
  brief: 'Create a Sunday worship service called Night of Praise on 20 September at 6 PM. Theme: Arise. Venue: Main sanctuary.',
  themeColor: '#6d28d9',
  images: [
    { index: 0, name: 'Pastor Jane and her husband', role: 'Hosts' },
    { index: 1, name: 'John Kamau', role: 'Guest minister' },
  ],
  excludedTemplateIds: [],
  templates: [
    {
      id: 'church-no-photo',
      name: 'Sunday service words only',
      category: 'church',
      description: 'A church service design without portraits.',
      fields: [
        { key: 'event_title', label: 'Event title', kind: 'text', supportedFacts: ['title'] },
        { key: 'service_when', label: 'Date and time', kind: 'text', supportedFacts: ['date', 'day', 'time'] },
        { key: 'event_theme', label: 'Theme', kind: 'text', supportedFacts: ['theme'] },
        { key: 'event_venue', label: 'Venue', kind: 'text', supportedFacts: ['venue'] },
      ],
    },
    {
      id: 'church-two-photo',
      name: 'Worship experience with host and guest',
      category: 'church',
      description: 'Two portrait slots for worship services.',
      fields: [
        { key: 'event_title', label: 'Event title', kind: 'text', supportedFacts: ['title'] },
        { key: 'service_when', label: 'Date and time', kind: 'text', supportedFacts: ['date', 'day', 'time'] },
        { key: 'event_theme', label: 'Theme', kind: 'text', supportedFacts: ['theme'] },
        { key: 'event_venue', label: 'Venue', kind: 'text', supportedFacts: ['venue'] },
        { key: 'host_photo', label: 'Host image', kind: 'image' },
        { key: 'guest_photo', label: 'Guest image', kind: 'image' },
      ],
    },
  ],
});

describe('AI template poster contract', () => {
  it('prefers a semantic template with the matching number of image slots', () => {
    const result = createFallbackTemplatePosterSelection(request);
    expect(result.templateId).toBe('church-two-photo');
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'event_title', value: 'Night of Praise' }),
        expect.objectContaining({ key: 'host_photo', imageIndex: 0 }),
        expect.objectContaining({ key: 'guest_photo', imageIndex: 1 }),
      ]),
    );
  });

  it('excludes the previous design when another template is available', () => {
    const result = createFallbackTemplatePosterSelection({
      ...request,
      excludedTemplateIds: ['church-two-photo'],
    });
    expect(result.templateId).toBe('church-no-photo');
  });

  it('rejects unknown selections and strips invalid field mappings', () => {
    expect(
      validateTemplatePosterSelection(request, {
        schemaVersion: 1,
        templateId: 'missing-template',
        fields: [],
      }),
    ).toBeNull();

    const valid = validateTemplatePosterSelection(request, {
      schemaVersion: 1,
      templateId: 'church-two-photo',
      fields: [
        { key: 'event_title', value: 'Worship Experience', imageIndex: null },
        { key: 'host_photo', value: null, imageIndex: 7 },
        { key: 'unknown', value: 'Ignore me', imageIndex: null },
      ],
    });
    expect(valid?.fields).toEqual([
      { key: 'event_title', value: 'Worship Experience', imageIndex: null },
    ]);
  });
});
