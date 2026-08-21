import { describe, expect, it } from 'vitest';
import {
  POSTER_RECONSTRUCTION_SCHEMA_VERSION,
  PosterReconstructionPlanSchema,
  createFallbackReconstructionPlan,
  type PosterReconstructionPlan,
  type ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import {
  amplifiedDetectedCornerRadius,
  compilePosterReconstruction,
  fitPersonReplacementIntoBox,
} from './compilePosterReconstruction';

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
    textEffect: 'flat',
    extrusionColor: null,
    cornerRadiusRatio: 0,
    pathPoints: [],
    pathClosed: false,
    pathTension: 0.28,
    imageRole: 'none',
    imageHasOverlays: false,
    replacementRecommended: false,
    replacementReason: '',
    imageSearchQuery: '',
    imageDominantColor: null,
    iconName: 'none',
    suggestedFieldKey: null,
    suggestedFieldLabel: '',
    confidence: 0.9,
    ...overrides,
  };
}

function plan(elements: ReconstructionElement[]): PosterReconstructionPlan {
  return PosterReconstructionPlanSchema.parse({
    schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
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
    const panel = compiled.project.elements.find((item) => item.type === 'rect');
    expect(panel).toMatchObject({ width: 900, height: 300 });
    if (panel?.type !== 'rect') throw new Error('Expected a rectangle panel.');
    expect(panel.rx).toBeCloseTo(42);
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

  it('turns clearly dimensional headline blocks into editable two-layer 3D elements', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'mens_title',
          kind: 'text',
          label: "MEN'S headline",
          box: { x: 0.08, y: 0.1, width: 0.84, height: 0.18 },
          text: "MEN'S",
          fontFamily: 'bebas_neue',
          fontWeight: '900',
          textEffect: 'two_layer_3d',
          fill: '#f4efe3',
          extrusionColor: '#176143',
          suggestedFieldKey: 'event_title',
          suggestedFieldLabel: 'Event title',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    const title = compiled.project.elements[0];
    expect(title).toMatchObject({
      type: '3d-text',
      layerName: "AI draft: MEN'S headline",
      previewWidth: expect.any(Number),
      previewHeight: expect.any(Number),
    });
    if (title?.type !== '3d-text') throw new Error('Expected a 3D text element.');
    expect(title.image).toContain('data:image/svg+xml');
    expect(title.config.text?.content).toBe("MEN'S");
    expect(title.config.textLayers).toHaveLength(2);
    expect(title.config.textLayers?.map((layer) => layer.extrusionColor)).toContain('#176143');
    expect(title.config.textLayers?.map((layer) => layer.frontColor)).toContain('#f4efe3');
    expect(compiled.fieldBindings[0]).toMatchObject({
      sourceElementId: 'reconstruction_mens_title',
      kind: 'text',
    });
  });

  it('uses a clean placeholder instead of a contaminated background-photo crop', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'praying_hands',
          kind: 'image_region',
          label: 'Praying hands background',
          box: { x: 0.1, y: 0.12, width: 0.8, height: 0.35 },
          imageRole: 'background_photo',
          imageHasOverlays: true,
          replacementRecommended: true,
          replacementReason: 'the title and date badge overlap the photograph',
          imageSearchQuery: 'praying hands dark navy background',
          imageDominantColor: '#17366f',
          suggestedFieldKey: 'background_photo',
          suggestedFieldLabel: 'Background photo',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    const photo = compiled.project.elements[0];
    expect(photo).toMatchObject({
      type: 'image',
      layerName: 'REPLACE IMAGE: Praying hands background',
      left: 100,
      top: 180,
    });
    if (photo?.type !== 'image') throw new Error('Expected an image placeholder.');
    expect(photo.src).toContain('data:image/svg+xml');
    expect(decodeURIComponent(photo.src)).toContain('REPLACE: Praying hands background');
    expect(compiled.warnings.join(' ')).toContain('title and date badge overlap');
  });

  it('keeps a complete person replacement visible and bottom-aligned in its detected region', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'guest_portrait',
          kind: 'image_region',
          label: 'Guest portrait',
          box: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
          imageRole: 'person',
          replacementRecommended: true,
          suggestedFieldKey: 'guest_photo',
          suggestedFieldLabel: 'Guest photo',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
      imageReplacements: {
        guest_portrait: {
          src: 'data:image/webp;base64,replacement',
          width: 400,
          height: 1000,
        },
      },
    });

    const portrait = compiled.project.elements[0];
    expect(portrait).toMatchObject({
      type: 'image',
      src: 'data:image/webp;base64,replacement',
      left: 250,
      top: 300,
      scaleX: 0.75,
      scaleY: 0.75,
    });
  });

  it('computes uniform contain scaling without cropping a tall portrait', () => {
    expect(fitPersonReplacementIntoBox(
      { width: 500, height: 1200 },
      { left: 100, top: 200, width: 600, height: 720 },
    )).toEqual({
      left: 250,
      top: 200,
      scaleX: 0.6,
      scaleY: 0.6,
    });
  });

  it('only amplifies corners already detected as rounded', () => {
    const box = { width: 800, height: 200 };
    expect(amplifiedDetectedCornerRadius(0, box)).toBe(0);
    expect(amplifiedDetectedCornerRadius(0.1, box)).toBeCloseTo(28);
    expect(amplifiedDetectedCornerRadius(0.5, box)).toBe(100);
  });

  it('rebuilds supported semantic icons as clean tintable SVG layers', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'venue_pin',
          kind: 'image_region',
          label: 'Location icon',
          box: { x: 0.05, y: 0.8, width: 0.08, height: 0.06 },
          imageRole: 'icon',
          iconName: 'location',
          imageDominantColor: '#176143',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    const icon = compiled.project.elements[0];
    expect(icon).toMatchObject({ type: 'image', layerName: 'AI icon: Location icon' });
    if (icon?.type !== 'image') throw new Error('Expected an icon image.');
    expect(decodeURIComponent(icon.src)).toContain('stroke="#176143"');
  });

  it('compiles one filled, outlined irregular panel with a smooth editable anchor', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'curved_photo_panel',
          kind: 'path',
          label: 'Curved photo boundary',
          box: { x: 0, y: 0.4, width: 1, height: 0.4 },
          fill: '#18b6a5',
          stroke: '#ffc21c',
          strokeWidthRatio: 0.02,
          pathClosed: true,
          pathTension: 0.28,
          pathPoints: [
            { x: 0, y: 1, smooth: false },
            { x: 0, y: 0.52, smooth: false },
            { x: 0.54, y: 0.42, smooth: true },
            { x: 1, y: 0, smooth: false },
            { x: 1, y: 1, smooth: false },
          ],
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    const path = compiled.project.elements[0];
    expect(path).toMatchObject({
      type: 'path',
      layerName: 'AI path: Curved photo boundary',
      left: 0,
      top: 600,
      fill: '#18b6a5',
      stroke: '#ffc21c',
      strokeWidth: 30,
      closed: true,
    });
    if (path?.type !== 'path') throw new Error('Expected an editable path element.');
    expect(path.pathPoints).toHaveLength(5);
    expect(path.pathPoints[0]).toEqual({ x: 15, y: 585 });
    expect(path.pathPoints[2]).toMatchObject({
      x: 540,
      y: 252,
      inX: expect.any(Number),
      inY: expect.any(Number),
      outX: expect.any(Number),
      outY: expect.any(Number),
    });
    expect(path.pathPoints[3]).toEqual({ x: 985, y: 15 });
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
