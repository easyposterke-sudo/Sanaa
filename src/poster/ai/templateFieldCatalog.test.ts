import { describe, expect, it } from 'vitest';
import {
  buildTemplatePosterCatalogField,
  inferTemplateFieldSemanticRole,
  inferTemplateFieldSupportedFacts,
} from './templateFieldCatalog';
import type { PosterTemplateDefinition } from '../templateTypes';

function template(text: string): PosterTemplateDefinition {
  return {
    id: 'template-1',
    name: 'Service',
    category: 'church',
    fields: [{ key: 'service_time', label: 'Service time', sourceElementId: 'time' }],
    project: {
      canvasWidth: 800,
      canvasHeight: 800,
      elements: [{
        id: 'time',
        type: 'text',
        text,
        left: 0,
        top: 0,
        width: 120,
        fontSize: 40,
        fontFamily: 'Arial',
        fill: '#000000',
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex: 1,
      }],
    },
  };
}

describe('template field catalog constraints', () => {
  it('keeps a short visual slot to four words and preserves its line count', () => {
    const input = template('08\nPM');
    expect(buildTemplatePosterCatalogField(input, input.fields![0]!)).toMatchObject({
      semanticRole: 'time',
      sampleText: '08\nPM',
      maxWords: 4,
      maxLines: 2,
    });
  });

  it('recognizes extra details as a large optional overflow slot', () => {
    const input = template('Other details');
    const field = { key: 'other_details', label: 'Other details', sourceElementId: 'time' };
    expect(buildTemplatePosterCatalogField(input, field)).toMatchObject({
      semanticRole: 'extra_details',
      optional: true,
      maxWords: 80,
      maxCharacters: 500,
    });
  });

  it('recognizes common semantic labels', () => {
    expect(inferTemplateFieldSemanticRole('event_time', 'Starts at')).toBe('time');
    expect(inferTemplateFieldSemanticRole('event_title', 'Headline')).toBe('title');
    expect(inferTemplateFieldSupportedFacts('dateTime', 'Date & Time')).toEqual(['time', 'date']);
    expect(inferTemplateFieldSupportedFacts('contact_website', 'Website')).toEqual(['website']);
    expect(inferTemplateFieldSupportedFacts('themeLine', 'Theme line')).toEqual(['theme', 'tagline']);
    expect(
      inferTemplateFieldSupportedFacts('contact', 'Contact', '+254 712 345 678'),
    ).toEqual(['phone']);
    expect(
      inferTemplateFieldSupportedFacts('when', 'When', 'Sunday\n20 September\n8 AM'),
    ).toEqual(['time', 'day', 'date']);
  });

  it('does not advertise truncation limits for organization or person names', () => {
    const input = template('Church Name');
    const organization = buildTemplatePosterCatalogField(input, {
      key: 'churchName',
      label: 'Church name',
      sourceElementId: 'time',
      kind: 'text',
    });
    const person = buildTemplatePosterCatalogField(input, {
      key: 'pastorName',
      label: 'Pastor name',
      sourceElementId: 'time',
      kind: 'text',
    });

    expect(organization).toMatchObject({
      semanticRole: 'organization',
      maxWords: null,
      maxCharacters: null,
      maxLines: null,
    });
    expect(person).toMatchObject({
      semanticRole: 'person_name',
      maxWords: null,
      maxCharacters: null,
      maxLines: null,
    });
  });
});
