import { describe, expect, it } from 'vitest';
import {
  PosterDesignerPlanSchema,
  PosterDesignerStartRequestSchema,
  validatePosterDesignerPlan,
} from '../../shared/ai/posterDesignerAgent';

function request() {
  return PosterDesignerStartRequestSchema.parse({
    sessionId: '2c7cf77a-0efa-4f88-a783-a0f20f4ebf12',
    brief: 'Theme: Arise. Venue: Main Sanctuary. Sunday at 10:00 AM.',
    categoryId: 'church',
    themeColor: null,
    images: [],
    templates: [
      {
        id: 'church-1',
        name: 'Church template',
        category: 'church',
        description: '',
        fields: [
          {
            key: 'venue',
            label: 'Venue',
            kind: 'text',
            semanticRole: 'venue',
            supportedFacts: ['venue'],
            sampleText: 'Main Hall',
            maxWords: null,
            maxCharacters: null,
            maxLines: null,
            optional: false,
          },
        ],
      },
    ],
    excludedTemplateIds: [],
    maxRevisions: 1,
  });
}

describe('poster designer agent contracts', () => {
  it('accepts an adaptive plan that creates a missing semantic block', () => {
    const plan = PosterDesignerPlanSchema.parse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'adaptive',
      concept: 'Preserve the church layout and add its missing theme.',
      fields: [{ key: 'venue', value: 'Main Sanctuary', imageIndex: null }],
      operations: [
        {
          id: 'add_theme',
          kind: 'add_text',
          elementId: null,
          semanticRole: 'theme',
          text: 'Arise',
          box: { x: 0.1, y: 0.32, width: 0.8, height: 0.08 },
          fontFamily: 'Inter',
          fontSizeRatio: 0.04,
          fontWeight: '800',
          textAlign: 'center',
          fill: '#ffffff',
          reason: 'The base template has no theme field.',
        },
      ],
      expectedFacts: ['theme', 'venue', 'day', 'time'],
    });
    const validated = validatePosterDesignerPlan(request(), plan);
    expect(validated).toMatchObject({
      templateId: plan.templateId,
      mode: 'adaptive',
      fields: plan.fields,
      operations: plan.operations,
    });
    expect(validated?.expectedFacts).toEqual(expect.arrayContaining(['theme', 'venue', 'time']));
    expect(validated?.expectedFacts).toContain('day');
  });

  it('filters fields that do not belong to the selected template', () => {
    const plan = PosterDesignerPlanSchema.parse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'strict',
      concept: 'Use the existing venue slot.',
      fields: [
        { key: 'venue', value: 'Main Sanctuary', imageIndex: null },
        { key: 'invented', value: 'Unsafe', imageIndex: null },
      ],
      operations: [],
      expectedFacts: ['venue'],
    });
    const validated = validatePosterDesignerPlan(request(), plan);
    expect(validated?.fields).toEqual([
      { key: 'venue', value: 'Main Sanctuary', imageIndex: null },
    ]);
    expect(validated?.expectedFacts).toEqual(expect.arrayContaining(['theme', 'venue', 'time']));
  });

  it('rejects an add_text operation without text or a box', () => {
    const parsed = PosterDesignerPlanSchema.safeParse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'adaptive',
      concept: 'Invalid operation.',
      fields: [],
      operations: [
        {
          id: 'bad_add',
          kind: 'add_text',
          elementId: null,
          semanticRole: 'theme',
          text: null,
          box: null,
          fontFamily: null,
          fontSizeRatio: null,
          fontWeight: null,
          textAlign: null,
          fill: null,
          reason: 'Missing required tool inputs.',
        },
      ],
      expectedFacts: [],
    });
    expect(parsed.success).toBe(false);
  });
});
