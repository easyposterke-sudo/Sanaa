import { describe, expect, it } from 'vitest';

import {
  TemplatePosterRequestSchema,
  detectProvidedMajorTemplateFacts,
  getSelectableTemplatePosterCatalog,
  validateTemplatePosterSelection,
} from '../../../shared/ai/templatePoster';

const textField = (key: string, label: string, supportedFacts: string[]) => ({
  key,
  label,
  kind: 'text' as const,
  supportedFacts,
});

const templates = [
  {
    id: 'complete',
    name: 'Complete service poster',
    category: 'church' as const,
    description: 'Theme, venue, and flexible contact fields.',
    fields: [
      textField('theme', 'Theme', ['theme']),
      textField('venue', 'Venue', ['venue']),
      textField('contact', 'Contact information', ['contact']),
    ],
  },
  {
    id: 'missing-theme',
    name: 'Poster without theme',
    category: 'church' as const,
    description: 'Venue and contact only.',
    fields: [
      textField('venue', 'Venue', ['venue']),
      textField('contact', 'Contact information', ['contact']),
    ],
  },
  {
    id: 'phone-only',
    name: 'Phone contact poster',
    category: 'church' as const,
    description: 'Theme, venue, and phone only.',
    fields: [
      textField('theme', 'Theme', ['theme']),
      textField('venue', 'Venue', ['venue']),
      textField('phone', 'Phone', ['phone']),
    ],
  },
];

const makeRequest = (brief: string) => TemplatePosterRequestSchema.parse({
  brief,
  themeColor: null,
  images: [],
  templates,
  excludedTemplateIds: [],
});

describe('major-fact template compatibility', () => {
  it('only offers templates with fields for every supplied major fact', () => {
    const request = makeRequest(
      'Create a worship poster. Theme: Arise. Venue: Main Hall. Website: gracechapel.org',
    );

    expect(detectProvidedMajorTemplateFacts(request.brief)).toEqual([
      'venue',
      'website',
      'theme',
    ]);
    expect(getSelectableTemplatePosterCatalog(request).map((template) => template.id)).toEqual([
      'complete',
    ]);
  });

  it('does not require a major field when the user did not supply that fact', () => {
    const request = makeRequest('Create a worship poster. Venue: Main Hall.');

    expect(getSelectableTemplatePosterCatalog(request).map((template) => template.id)).toEqual([
      'complete',
      'missing-theme',
      'phone-only',
    ]);
  });

  it('never treats an optional event title or modifier as a compatibility requirement', () => {
    const request = makeRequest('Create a Sunday service poster titled Men\'s Sunday Service. Venue: Main Hall.');

    expect(detectProvidedMajorTemplateFacts(request.brief)).toEqual(['venue']);
    expect(getSelectableTemplatePosterCatalog(request).map((template) => template.id)).toEqual([
      'complete',
      'missing-theme',
      'phone-only',
    ]);
  });

  it('does not treat a phone-only field as a place for a supplied website', () => {
    const request = makeRequest('Create a worship poster. Website: gracechapel.org');
    expect(getSelectableTemplatePosterCatalog(request).map((template) => template.id)).toEqual([
      'complete',
      'missing-theme',
    ]);
  });

  it('rejects a model selection that lacks a required major field', () => {
    const request = makeRequest('Create a worship poster. Theme: Arise.');
    expect(validateTemplatePosterSelection(request, {
      schemaVersion: 1,
      templateId: 'missing-theme',
      fields: [],
    })).toBeNull();
  });
});
