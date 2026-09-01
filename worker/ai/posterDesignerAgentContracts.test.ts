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

  it('removes an added text block when the same semantic fact already fills a template field', () => {
    const plan = PosterDesignerPlanSchema.parse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'adaptive',
      concept: 'Use the existing venue treatment once.',
      fields: [{ key: 'venue', value: 'Main Sanctuary', imageIndex: null }],
      operations: [{
        id: 'repeat_venue',
        kind: 'add_text',
        elementId: null,
        semanticRole: 'venue',
        text: 'Main Sanctuary',
        box: { x: 0.1, y: 0.7, width: 0.8, height: 0.05 },
        fontFamily: 'Inter',
        fontSizeRatio: 0.025,
        fontWeight: '600',
        textAlign: 'center',
        fill: '#ffffff',
        reason: 'Duplicate venue that should be filtered.',
      }],
      expectedFacts: ['venue'],
    });
    const validated = validatePosterDesignerPlan(request(), plan);
    expect(validated?.operations).toEqual([]);
  });

  it('does not add a Sunday Service title when split unlabeled template copy already expresses it', () => {
    const input = request();
    input.templates[0]!.existingText = [
      {
        elementId: 'fixed-sunday', text: 'SUNDAY', semanticRole: 'title', labeled: false,
        fontSizeRatio: 0.12, box: { x: 0.1, y: 0.08, width: 0.8, height: 0.14 },
      },
      {
        elementId: 'fixed-service', text: 'SERVICE', semanticRole: 'title', labeled: false,
        fontSizeRatio: 0.1, box: { x: 0.2, y: 0.22, width: 0.7, height: 0.12 },
      },
    ];
    const plan = PosterDesignerPlanSchema.parse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'adaptive',
      concept: 'Preserve the existing split headline.',
      fields: [],
      operations: [{
        id: 'repeat_service_title', kind: 'add_text', elementId: null, semanticRole: 'title',
        text: 'Sunday Service', box: { x: 0.1, y: 0.2, width: 0.8, height: 0.15 },
        fontFamily: 'Impact', fontSizeRatio: 0.1, fontWeight: '900', textAlign: 'center',
        fill: '#ffffff', reason: 'Duplicate title that must be filtered.',
      }],
      expectedFacts: ['title'],
    });
    expect(validatePosterDesignerPlan(input, plan)?.operations).toEqual([]);
  });

  it('does not fill a labeled title slot with copy already expressed by unlabeled template art', () => {
    const input = request();
    input.templates[0]!.fields.push({
      key: 'event_title', label: 'Event title', kind: 'text', semanticRole: 'title',
      supportedFacts: ['title'], sampleText: 'EVENT TITLE', maxWords: 8,
      maxCharacters: 72, maxLines: 2, optional: false,
    });
    input.templates[0]!.existingText = [
      {
        elementId: 'fixed-sunday', text: 'SUNDAY', semanticRole: 'title', labeled: false,
        fontSizeRatio: 0.12, box: { x: 0.1, y: 0.08, width: 0.8, height: 0.14 },
      },
      {
        elementId: 'fixed-service', text: 'SERVICE', semanticRole: 'title', labeled: false,
        fontSizeRatio: 0.1, box: { x: 0.2, y: 0.22, width: 0.7, height: 0.12 },
      },
    ];
    const plan = PosterDesignerPlanSchema.parse({
      schemaVersion: 1,
      templateId: 'church-1',
      mode: 'adaptive',
      concept: 'Keep the fixed visual headline.',
      fields: [{ key: 'event_title', value: 'Sunday Service', imageIndex: null }],
      operations: [],
      expectedFacts: ['title'],
    });
    expect(validatePosterDesignerPlan(input, plan)?.fields).toEqual([]);
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
