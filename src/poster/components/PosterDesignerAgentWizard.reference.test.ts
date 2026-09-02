import { describe, expect, it } from 'vitest';
import { creativePlanElement } from '../../../shared/ai/posterCreativeAgent';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION, type PosterReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import {
  annotateReferencePlan,
  buildReferenceFieldAnchors,
  resolveReferenceCanvasSize,
  shouldPrepareReferenceCutout,
  stabilizeReferenceFieldLayout,
} from '../ai/referenceAgentPipeline';

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

  it('preserves the exact reference aspect ratio instead of snapping it to A4', () => {
    expect(resolveReferenceCanvasSize(1080, 1440)).toEqual({
      width: 1080,
      height: 1440,
      label: 'reference ratio 1080×1440',
    });
    expect(resolveReferenceCanvasSize(6000, 3000)).toEqual({
      width: 4096,
      height: 2048,
      label: 'reference ratio 4096×2048',
    });
  });

  it('restores mapped text to its reconstructed reference region after a critic moves it', () => {
    const plan = annotateReferencePlan(referencePlan());
    const bindings = [{ key: 'event_title', label: 'Event title', sourceElementId: 'mapped-title', kind: 'text' as const }];
    const sourceProject = {
      canvasWidth: 1080,
      canvasHeight: 1350,
      canvasBackground: { type: 'solid' as const, color: '#ffffff' },
      elements: [{
        id: 'mapped-title', type: 'text' as const, text: 'SUNDAY SERVICE',
        left: 0.18 * 1080, top: 0.28 * 1350, width: 0.64 * 1080,
        fontSize: 84, fontFamily: '"Playfair Display", serif', fill: '#ef3340',
        fontWeight: '900', fontStyle: 'italic' as const, charSpacing: 18, lineHeight: 0.92,
        textAlign: 'center' as const, stroke: '#ffffff', strokeWidth: 2,
        scaleX: 1, scaleY: 1, angle: -2, opacity: 0.94, zIndex: 7,
      }],
    };
    const anchors = buildReferenceFieldAnchors(plan, sourceProject, bindings);
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
      bindings,
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
    expect(title).toMatchObject({
      fontSize: 84,
      fontFamily: '"Playfair Display", serif',
      fill: '#ef3340',
      fontWeight: '900',
      fontStyle: 'italic',
      charSpacing: 18,
      lineHeight: 0.92,
      textAlign: 'center',
      stroke: '#ffffff',
      strokeWidth: 2,
      angle: -2,
      opacity: 0.94,
      zIndex: 7,
    });
    expect(result.adjustedElementIds).toContain('mapped-title');
  });

  it('recovers a misclassified event-title crop as editable text while preserving real logos', () => {
    const plan = annotateReferencePlan({
      ...referencePlan(),
      elements: [
        creativePlanElement({
          key: 'title_art', kind: 'image_region', label: 'Stylized Sunday Service headline',
          box: { x: 0.12, y: 0.2, width: 0.76, height: 0.2 }, zIndex: 4,
          imageRole: 'decoration', imageDominantColor: '#ef3340',
        }),
        creativePlanElement({
          key: 'church_logo', kind: 'image_region', label: 'Church logo',
          box: { x: 0.45, y: 0.04, width: 0.1, height: 0.08 }, zIndex: 5,
          imageRole: 'logo',
        }),
      ],
    });

    expect(plan.elements[0]).toMatchObject({
      kind: 'text',
      text: 'Sunday Service',
      fill: '#ef3340',
      imageRole: 'none',
      suggestedFieldKey: 'event_title',
    });
    expect(plan.elements[1]).toMatchObject({ kind: 'image_region', imageRole: 'logo' });
  });

  it('requests background removal only for unmasked reference portrait cutouts', () => {
    const cutout = creativePlanElement({
      key: 'person', kind: 'image_region', label: 'Foreground speaker cutout',
      box: { x: 0.2, y: 0.3, width: 0.5, height: 0.65 }, zIndex: 4,
      imageRole: 'person', imageCutout: true, replacementRecommended: true,
    });
    const framed = { ...cutout, key: 'framed', label: 'Speaker photo', imageCutout: false, imageMask: 'rounded_rect' as const };
    expect(shouldPrepareReferenceCutout(cutout)).toBe(true);
    expect(shouldPrepareReferenceCutout(framed)).toBe(false);
  });

  it('restores the exact reference portrait placement and bottom fade after critic changes', () => {
    const plan = annotateReferencePlan({
      ...referencePlan(),
      elements: [creativePlanElement({
        key: 'speaker', kind: 'image_region', label: 'Speaker cutout',
        box: { x: 0.2, y: 0.3, width: 0.5, height: 0.65 }, zIndex: 4,
        imageRole: 'person', imageCutout: true, imageEdge: 'fade',
        imageFadeDirection: 'bottom', imageFadeAmount: 0.24, imageFadeMinOpacity: 0.1,
      })],
    });
    const bindings = [{ key: 'person_photo', label: 'Person photo', sourceElementId: 'speaker-image', kind: 'image' as const }];
    const source = {
      canvasWidth: 1080, canvasHeight: 1350,
      canvasBackground: { type: 'solid' as const, color: '#ffffff' },
      elements: [{
        id: 'speaker-image', type: 'image' as const, src: 'data:image/png;base64,source',
        left: 210, top: 390, scaleX: 0.75, scaleY: 0.75, angle: 0, opacity: 1, zIndex: 4,
        mask: 'none' as const, edge: 'fade' as const, edgeFadeDirection: 'bottom' as const,
        edgeFadeAmount: 0.24, edgeFadeMinOpacity: 0.1,
      }],
    };
    const anchors = buildReferenceFieldAnchors(plan, source, bindings);
    const moved = {
      ...source,
      elements: [{
        ...source.elements[0]!, src: 'data:image/png;base64,replacement',
        left: 700, top: 50, scaleX: 0.3, scaleY: 0.4,
        edgeFadeDirection: 'radial' as const, edgeFadeAmount: 0.8,
      }],
    };
    const result = stabilizeReferenceFieldLayout(moved, bindings, [], anchors);

    expect(result.project.elements[0]).toMatchObject({
      src: 'data:image/png;base64,replacement',
      left: 210, top: 390, scaleX: 0.75, scaleY: 0.75,
      edge: 'fade', edgeFadeDirection: 'bottom', edgeFadeAmount: 0.24, edgeFadeMinOpacity: 0.1,
    });
    expect(result.adjustedElementIds).toContain('speaker-image');
  });
});
