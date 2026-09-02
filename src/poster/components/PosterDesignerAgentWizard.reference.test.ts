import { describe, expect, it } from 'vitest';
import { creativePlanElement } from '../../../shared/ai/posterCreativeAgent';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION, type PosterReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import { annotateReferencePlan, buildReferenceFieldAnchors, stabilizeReferenceFieldLayout } from '../ai/referenceAgentPipeline';

function referencePlan(): PosterReconstructionPlan {
  return {
    schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
    suggestedTemplateName: 'Reference',
    category: 'church',
    summary: 'A reconstructed reference poster.',
    canvas: { backgroundType: 'solid', backgroundTop: '#ffffff', backgroundBottom: '#ffffff', gradientAngle: 0 },
    elements: [
      creativePlanElement({ key: 'church', kind: 'text', label: 'Church name', box: { x: 0.3, y: 0.07, width: 0.4, height: 0.05 }, zIndex: 2, text: 'COMMUNITY CHURCH', visibleLineCount: 2 }),
      creativePlanElement({ key: 'headline', kind: 'text', label: 'Headline', box: { x: 0.18, y: 0.28, width: 0.64, height: 0.18 }, zIndex: 3, text: 'SUNDAY SERVICE', visibleLineCount: 2, fontSizeRatio: 0.08 }),
      creativePlanElement({ key: 'banner', kind: 'text', label: 'Banner', box: { x: 0.2, y: 0.52, width: 0.6, height: 0.06 }, zIndex: 4, text: 'WORSHIP PRAISE PREACHING', visibleLineCount: 1 }),
      creativePlanElement({ key: 'date', kind: 'text', label: 'Date', box: { x: 0.25, y: 0.67, width: 0.2, height: 0.08 }, zIndex: 5, text: '20 SEPT 2070', visibleLineCount: 2 }),
    ],
    warnings: [],
    confidence: 0.9,
  };
}

describe('Agent Designer reference adaptation', () => {
  it('turns every reference text region into a unique semantic slot and protects its geometry', () => {
    const plan = annotateReferencePlan(referencePlan());
    const text = plan.elements.filter((element) => element.kind === 'text');
    const keys = text.map((element) => element.suggestedFieldKey);
    const banner = text.find((element) => element.key === 'banner');
    const anchors = buildReferenceFieldAnchors(plan);

    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(banner?.suggestedFieldKey).toBe('theme');
    expect(anchors.event_title?.box).toEqual({ x: 0.18, y: 0.28, width: 0.64, height: 0.18 });
  });

  it('restores mapped text to its reconstructed reference region after a critic moves it', () => {
    const plan = annotateReferencePlan(referencePlan());
    const anchors = buildReferenceFieldAnchors(plan);
    const project = {
      canvasWidth: 1080,
      canvasHeight: 1350,
      canvasBackground: { type: 'solid' as const, color: '#ffffff' },
      elements: [{
        id: 'mapped-title',
        type: 'text' as const,
        text: 'SUNDAY SERVICE',
        left: 600,
        top: 700,
        width: 900,
        fontSize: 120,
        fontFamily: 'Arial',
        fill: '#000000',
        textAlign: 'left' as const,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex: 1,
      }],
    };
    const result = stabilizeReferenceFieldLayout(
      project,
      [{ key: 'event_title', label: 'Event title', sourceElementId: 'mapped-title', kind: 'text' }],
      [{
        id: 'mapped-title', type: 'text', semanticRole: 'title', text: 'SUNDAY SERVICE',
        box: { x: 0.55, y: 0.52, width: 0.7, height: 0.25 }, fontSizeRatio: 0.09,
        textAlign: 'left', fill: '#000000', zIndex: 1, agentCreated: false, locked: false,
      }],
      anchors,
    );
    const title = result.project.elements[0]!;
    expect(title.left).toBeCloseTo(0.18 * 1080);
    expect(title.top).toBeCloseTo(0.28 * 1350);
    expect(result.adjustedElementIds).toContain('mapped-title');
  });
});
