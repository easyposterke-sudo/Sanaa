import { describe, expect, it } from 'vitest';

import {
  TemplatePosterRequestSchema,
  TemplatePosterSelectionSchema,
  validateTemplatePosterSelection,
  type TemplatePosterCatalogItem,
} from '../../../shared/ai/templatePoster';

const catalog: TemplatePosterCatalogItem[] = [
  {
    id: 'sunday-service',
    name: 'Sunday Service',
    category: 'church',
    description: 'A Sunday service poster',
    fields: [
      {
        key: 'time',
        label: 'Time',
        kind: 'text',
        semanticRole: 'time',
        sampleText: '08\nPM',
        maxWords: 2,
        maxCharacters: 8,
        maxLines: 2,
        optional: false,
      },
      {
        key: 'otherDetails',
        label: 'Other details',
        kind: 'text',
        semanticRole: 'extra_details',
        sampleText: 'Other details',
        maxWords: 80,
        maxCharacters: 500,
        maxLines: 8,
        optional: true,
      },
    ],
  },
];

const requestFor = (templates: TemplatePosterCatalogItem[]) =>
  TemplatePosterRequestSchema.parse({
    brief: 'Sunday service with first service at 8am and second service at 9:30am.',
    themeColor: null,
    images: [],
    templates,
    excludedTemplateIds: [],
  });

const fieldValue = (
  selection: ReturnType<typeof validateTemplatePosterSelection>,
  key: string,
) => selection?.fields.find((field) => field.key === key)?.value;

describe('template poster structural constraints', () => {
  it('keeps only the primary time in a compact time slot and routes the rest', () => {
    const selection = validateTemplatePosterSelection(
      requestFor(catalog),
      TemplatePosterSelectionSchema.parse({
        schemaVersion: 1,
        templateId: 'sunday-service',
        fields: [
          {
            key: 'time',
            value: 'First service: 8am; Second service: 9:30am',
            imageIndex: null,
          },
        ],
      }),
    );

    expect(fieldValue(selection, 'time')).toBe('08\nAM');
    expect(fieldValue(selection, 'otherDetails')).toBe('Second service: 9:30 AM');
  });

  it('leaves optional extra details empty when there is no overflow', () => {
    const selection = validateTemplatePosterSelection(
      requestFor(catalog),
      TemplatePosterSelectionSchema.parse({
        schemaVersion: 1,
        templateId: 'sunday-service',
        fields: [{ key: 'time', value: '8am', imageIndex: null }],
      }),
    );

    expect(fieldValue(selection, 'time')).toBe('08\nAM');
    expect(fieldValue(selection, 'otherDetails')).toBeUndefined();
  });

  it('rejects a schedule from a title-shaped field and preserves it as details', () => {
    const titleCatalog: TemplatePosterCatalogItem[] = [
      {
        ...catalog[0],
        fields: [
          {
            key: 'eventTitle',
            label: 'Event title',
            kind: 'text',
            semanticRole: 'title',
            sampleText: 'Sunday Service',
            maxWords: 4,
            maxCharacters: 30,
            maxLines: 1,
            optional: false,
          },
          catalog[0].fields[1],
        ],
      },
    ];

    const selection = validateTemplatePosterSelection(
      requestFor(titleCatalog),
      TemplatePosterSelectionSchema.parse({
        schemaVersion: 1,
        templateId: 'sunday-service',
        fields: [
          {
            key: 'eventTitle',
            value: 'First service at 8am and second service at 9:30am',
            imageIndex: null,
          },
        ],
      }),
    );

    expect(fieldValue(selection, 'eventTitle')).toBe('');
    expect(fieldValue(selection, 'otherDetails')).toContain('First service at 8am');
  });

  it('preserves complete organization and person names without overflow', () => {
    const identityCatalog: TemplatePosterCatalogItem[] = [
      {
        ...catalog[0],
        fields: [
          {
            key: 'churchName',
            label: 'Church name',
            kind: 'text',
            semanticRole: 'organization',
            sampleText: 'Church Name',
            maxWords: 2,
            maxCharacters: 16,
            maxLines: 1,
            optional: false,
          },
          {
            key: 'pastorName',
            label: 'Pastor name',
            kind: 'text',
            semanticRole: 'person_name',
            sampleText: 'Pastor Name',
            maxWords: 2,
            maxCharacters: 14,
            maxLines: 1,
            optional: false,
          },
          catalog[0].fields[1],
        ],
      },
    ];
    const selection = validateTemplatePosterSelection(
      requestFor(identityCatalog),
      TemplatePosterSelectionSchema.parse({
        schemaVersion: 1,
        templateId: 'sunday-service',
        fields: [
          {
            key: 'churchName',
            value: 'Christ Ekklesia Fellowship Chapel',
            imageIndex: null,
          },
          {
            key: 'pastorName',
            value: 'Pastor David Kiplagat Kituyi',
            imageIndex: null,
          },
        ],
      }),
    );

    expect(fieldValue(selection, 'churchName')).toBe('Christ Ekklesia Fellowship Chapel');
    expect(fieldValue(selection, 'pastorName')).toBe('Pastor David Kiplagat Kituyi');
    expect(fieldValue(selection, 'otherDetails')).toBeUndefined();
  });
});
