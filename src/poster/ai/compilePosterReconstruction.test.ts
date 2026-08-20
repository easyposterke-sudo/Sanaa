import { describe, expect, it } from 'vitest';
import {
  PosterReconstructionPlanSchema,
  createFallbackReconstructionPlan,
  type PosterReconstructionPlan,
  type ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import { compilePosterReconstruction } from './compilePosterReconstruction';

function element(overrides: Partial<ReconstructionElement>): ReconstructionElement {
  return {
    key: 'element',
    kind: 'rect',
    label: 'Element',
    box: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
    angle: 0,
    opacity: 1,
    zIndex: 1,
    fill: '#112233',
    stroke: null,
    strokeWidthRatio: 0,
    text: '',
    fontFamily: 'arial',
    fontSizeRatio: 0.04,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    charSpacing: 0,
    lineHeight: 1.16,
    cornerRadiusRatio: 0,
    imageRole: 'none',
    suggestedFieldKey: null,
    suggestedFieldLabel: '',
    confidence: 0.9,
    ...overrides,
  };
}

function plan(elements: ReconstructionElement[]): PosterReconstructionPlan {
  return PosterReconstructionPlanSchema.parse({
    schemaVersion: 1,
    suggestedTemplateName: 'Two person conference',
    category: 'conference',
    summary: 'Centered conference layout with a dark green background.',
    canvas: {
      backgroundType: 'linear',
      backgroundTop: '#102820',
      backgroundBottom: '#245a43',
      gradientAngle: 180,
    },
    elements,
    warnings: [],
    confidence: 0.8,
  });
}

describe('compilePosterReconstruction', () => {
  it('creates editable layers at source-relative coordinates and suggests fields', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'title',
          kind: 'text',
          label: 'Event title',
          box: { x: 0.1, y: 0.08, width: 0.8, height: 0.14 },
          zIndex: 2,
          text: 'ANNUAL CONFERENCE',
          fontFamily: 'bebas_neue',
          fontSizeRatio: 0.08,
          fontWeight: '900',
          textAlign: 'center',
          fill: '#ffffff',
          suggestedFieldKey: 'event_title',
          suggestedFieldLabel: 'Event title',
        }),
        element({
          key: 'title_panel',
          kind: 'rect',
          label: 'Title panel',
          box: { x: 0.05, y: 0.05, width: 0.9, height: 0.2 },
          zIndex: 1,
          cornerRadiusRatio: 0.1,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.canvasWidth).toBe(1000);
    expect(compiled.project.canvasHeight).toBe(1500);
    expect(compiled.project.elements).toHaveLength(2);
    const title = compiled.project.elements.find((item) => item.type === 'text');
    expect(title).toMatchObject({
      left: 100,
      top: 120,
      width: 800,
      text: 'ANNUAL CONFERENCE',
      textAlign: 'center',
    });
    expect(compiled.fieldBindings).toEqual([
      {
        key: 'event_title',
        label: 'Event title',
        sourceElementId: 'reconstruction_title',
        kind: 'text',
      },
    ]);
    expect(compiled.category).toBe('conference');
  });

  it('adds a locked tracing guide and carries review warnings', async () => {
    const compiled = await compilePosterReconstruction({
      plan: createFallbackReconstructionPlan(),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 800,
        height: 1000,
      },
      referenceGuideOpacity: 0.25,
    });

    expect(compiled.project.elements).toHaveLength(1);
    expect(compiled.project.elements[0]).toMatchObject({
      type: 'image',
      locked: true,
      opacity: 0.25,
    });
    expect(compiled.warnings.join(' ')).toContain('reference guide');
    expect(compiled.warnings.join(' ')).toContain('No editable layers');
  });
});

describe('PosterReconstructionPlanSchema', () => {
  it('rejects arbitrary executable fields', () => {
    const unsafe = {
      ...createFallbackReconstructionPlan(),
      javascript: 'fetch("https://example.test")',
    };
    expect(PosterReconstructionPlanSchema.safeParse(unsafe).success).toBe(false);
  });
});
