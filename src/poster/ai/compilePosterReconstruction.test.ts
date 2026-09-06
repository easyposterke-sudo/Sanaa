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
  fitDetectedTextFontSize,
  fitDetectedTextToInkBox,
  fitPersonReplacementIntoBox,
  resolvedDetectedCornerRadius,
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
    textFillType: 'solid',
    textFillStart: null,
    textFillEnd: null,
    textFillAngle: 0,
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
    visibleLineCount: 0,
    textCurve: 0,
    textEffect: 'flat',
    textHasVisibleExtrusion: false,
    textExtrusionDepthRatio: 0,
    extrusionColor: null,
    cornerRadiusRatio: 0,
    cornerStyle: 'auto',
    pathPoints: [],
    pathUsage: 'not_applicable',
    pathClosed: false,
    pathTension: 0.28,
    imageRole: 'none',
    imageMask: 'none',
    imageCutout: false,
    imageEdge: 'none',
    imageFadeDirection: 'radial',
    imageFadeAmount: 0.35,
    imageFadeMinOpacity: 0,
    imageBrightness: 0,
    imageContrast: 0,
    imageSaturation: 0,
    imageBlur: 0,
    imageTintColor: null,
    imageTintAmount: 0,
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
      text: 'ANNUAL CONFERENCE',
      textAlign: 'center',
    });
    if (title?.type !== 'text') throw new Error('Expected title text.');
    expect((title.width ?? 0) * title.scaleX).toBeCloseTo(800);
    expect(title.top).toBeLessThan(120);
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

  it('preserves detected curved text as an editable curve value', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'curved_headline',
          kind: 'text',
          label: 'Curved headline',
          text: 'DEFINE YOUR BRAND',
          textAlign: 'center',
          visibleLineCount: 1,
          textCurve: 64,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'text',
      text: 'DEFINE YOUR BRAND',
      curve: 64,
    });
  });

  it('resolves an approved custom font catalogue ID to its loaded editor family', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'custom_title',
          kind: 'text',
          label: 'Custom title',
          text: 'WE ARE OPEN',
          fontFamily: 'arial',
          fontCatalogId: 'c_brand',
          visibleLineCount: 1,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
      fontCatalogFamilies: {
        c_brand: 'Editor3DCustom_cloud-font-brand',
      },
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'text',
      fontFamily: 'Editor3DCustom_cloud-font-brand',
    });
  });

  it('rebuilds detected headline gradients as editable gradient-filled text', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'gradient_title',
          kind: 'text',
          label: 'Gradient title',
          text: 'SUNDAY',
          textFillType: 'linear',
          textFillStart: '#e90073',
          textFillEnd: '#ff8a00',
          textFillAngle: 0,
          visibleLineCount: 1,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'text',
      text: 'SUNDAY',
      fillGradient: {
        type: 'linear',
        angle: 0,
        stops: [
          { offset: 0, color: '#e90073' },
          { offset: 1, color: '#ff8a00' },
        ],
      },
    });
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
      excludeFromExport: true,
    });
    expect(compiled.warnings.join(' ')).toContain('reference guide');
    expect(compiled.warnings.join(' ')).toContain('No editable layers');
  });

  it('compiles a small reference into the chosen high-resolution canvas', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 528,
        height: 528,
      },
      canvasSize: { width: 1080, height: 1080 },
      referenceGuideOpacity: 0.2,
    });

    expect(compiled.project.canvasWidth).toBe(1080);
    expect(compiled.project.canvasHeight).toBe(1080);
    expect(compiled.project.elements.find((item) => item.type === 'rect')).toMatchObject({
      left: 270,
      top: 270,
      width: 540,
      height: 540,
    });
    expect(compiled.project.elements.find((item) => item.type === 'image')).toMatchObject({
      scaleX: 1080 / 528,
      scaleY: 1080 / 528,
      excludeFromExport: true,
    });
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
          textHasVisibleExtrusion: true,
          textExtrusionDepthRatio: 0.18,
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

  it('keeps gradient outlined headlines flat when connected extrusion evidence is absent', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'grace_encounter',
          kind: 'text',
          label: 'GRACE ENCOUNTER headline',
          box: { x: 0.12, y: 0.5, width: 0.76, height: 0.14 },
          text: 'GRACE\nENCOUNTER',
          fontFamily: 'arial_black',
          fontWeight: '900',
          textEffect: 'two_layer_3d',
          textHasVisibleExtrusion: false,
          textExtrusionDepthRatio: 0,
          textFillType: 'linear',
          textFillStart: '#f5a13a',
          textFillEnd: '#e56d20',
          stroke: '#101b49',
          strokeWidthRatio: 0.006,
          extrusionColor: '#101b49',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 720,
        height: 1280,
      },
      referenceGuideOpacity: 0,
    });

    const title = compiled.project.elements[0];
    expect(title).toMatchObject({
      type: 'text',
      text: 'GRACE\nENCOUNTER',
      fillGradient: {
        type: 'linear',
        angle: 0,
        stops: [
          { offset: 0, color: '#f5a13a' },
          { offset: 1, color: '#e56d20' },
        ],
      },
      stroke: '#101b49',
    });
    expect(compiled.warnings).toContain(
      '“GRACE ENCOUNTER headline” was kept flat because no measurable connected extrusion side faces were verified.',
    );
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
          opacity: 0.82,
          imageBrightness: -28,
          imageContrast: 12,
          imageSaturation: -18,
          imageBlur: 34,
          imageTintColor: '#1f140c',
          imageTintAmount: 38,
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
      assetRole: 'background',
      backgroundLibraryLabel: 'Praying hands background',
      left: 100,
      top: 180,
      opacity: 0.82,
      adjustBrightness: -28,
      adjustContrast: 12,
      adjustSaturation: -18,
      adjustBlur: 34,
      adjustTintColor: '#1f140c',
      adjustTintAmount: 38,
    });
    if (photo?.type !== 'image') throw new Error('Expected an image placeholder.');
    expect(photo.src).toContain('data:image/svg+xml');
    expect(decodeURIComponent(photo.src)).toContain('REPLACE: Praying hands background');
    expect(compiled.warnings.join(' ')).toContain('title and date badge overlap');
  });

  it('repairs a misclassified circular text badge into editable circle and text layers', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'enroll_badge',
          kind: 'image_region',
          label: 'Enroll Today badge',
          box: { x: 0.65, y: 0.55, width: 0.2, height: 0.1333333333 },
          imageRole: 'decoration',
          imageHasOverlays: true,
          replacementRecommended: true,
          replacementReason: 'the words overlap the colored badge',
          imageDominantColor: '#e52d1b',
          suggestedFieldKey: 'enroll_callout',
          suggestedFieldLabel: 'Enroll callout',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements).toHaveLength(2);
    expect(compiled.project.elements.some((item) => item.type === 'image')).toBe(false);
    expect(compiled.project.elements[0]).toMatchObject({
      type: 'circle',
      fill: '#e52d1b',
      left: 650,
      radius: 100,
    });
    expect(compiled.project.elements[0]?.top).toBeCloseTo(825);
    expect(compiled.project.elements[1]).toMatchObject({
      type: 'text',
      text: 'Enroll\nToday',
      textAlign: 'center',
      fill: '#ffffff',
      angle: 0,
    });
    expect(compiled.fieldBindings).toEqual([{
      key: 'enroll_callout',
      label: 'Enroll callout',
      sourceElementId: 'reconstruction_enroll_badge',
      kind: 'text',
    }]);
    expect(compiled.warnings.join(' ')).toContain('editable shape and text');
  });

  it('repairs a wide text badge as a rounded rectangle without affecting photo placeholders', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'did_you_know',
          kind: 'image_region',
          label: 'Did You Know badge',
          box: { x: 0.08, y: 0.32, width: 0.35, height: 0.1 },
          angle: -32,
          imageRole: 'decoration',
          imageHasOverlays: true,
          replacementRecommended: true,
          replacementReason: 'the words overlap the colored rectangle',
          imageDominantColor: '#ffba08',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements).toHaveLength(2);
    const background = compiled.project.elements[0];
    expect(background).toMatchObject({
      type: 'rect',
      width: 350,
      height: 150,
      fill: '#ffba08',
      angle: -32,
    });
    if (background?.type !== 'rect') throw new Error('Expected a rounded rectangle badge.');
    expect(background.rx).toBeGreaterThan(0);
    expect(compiled.project.elements[1]).toMatchObject({
      type: 'text',
      text: 'Did You Know',
      fill: '#111111',
      angle: -32,
    });
  });

  it('does not rewrite a photographic or branded badge as text', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'school_badge',
          kind: 'image_region',
          label: 'School badge',
          imageRole: 'logo',
          imageHasOverlays: true,
          replacementRecommended: true,
          replacementReason: 'the source logo is incomplete',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements).toHaveLength(1);
    expect(compiled.project.elements[0]).toMatchObject({
      type: 'image',
      layerName: 'REPLACE IMAGE: School badge',
    });
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

  it('uses explicit corner classes without changing old auto-radius behavior', () => {
    const box = { width: 800, height: 200 };
    expect(resolvedDetectedCornerRadius('auto', 0, box)).toBe(0);
    expect(resolvedDetectedCornerRadius('sharp', 0.4, box)).toBe(0);
    expect(resolvedDetectedCornerRadius('subtle', 0, box)).toBeCloseTo(12);
    expect(resolvedDetectedCornerRadius('rounded', 0, box)).toBeCloseTo(32);
    expect(resolvedDetectedCornerRadius('pill', 0, box)).toBeCloseTo(84);
  });

  it('shrinks a detected one-line heading to prevent unintended wrapping', () => {
    const fitted = fitDetectedTextFontSize({
      lines: ['ACTIVITIES INCLUDE:'],
      fontFamily: '"Anton", sans-serif',
      fontWeight: '700',
      fontStyle: 'normal',
      charSpacing: 0,
      initialFontSize: 80,
      availableWidth: 360,
    });
    expect(fitted).toBeLessThan(80);
    expect(fitted).toBeGreaterThanOrEqual(6);
  });

  it('converts a visible ink box to Fabric em size and baseline position', () => {
    const layout = fitDetectedTextToInkBox({
      lines: ['SUN'],
      fontFamily: 'Test Sans',
      fontWeight: '900',
      fontStyle: 'normal',
      charSpacing: 0,
      lineHeight: 1.16,
      textAlign: 'left',
      targetBox: { left: 100, top: 200, width: 300, height: 100 },
      targetVisibleGlyphHeight: 100,
      constrainToDetectedBox: true,
      measureLine: (line, fontSize) => ({
        advanceWidth: line.length * fontSize * 0.5,
        inkLeft: 0,
        inkRight: line.length * fontSize * 0.5,
        ascent: fontSize * 0.72,
        descent: fontSize * 0.02,
      }),
    });

    expect(layout.fontSize).toBeCloseTo(100 / 0.74);
    expect(layout.fontSize).toBeGreaterThan(100);
    expect(layout.top).toBeLessThan(200);
    expect(layout.width * layout.scaleX).toBeCloseTo(300);
    const baseline = layout.fontSize * 1.13 * (1 - 0.222);
    expect(layout.top + baseline - layout.fontSize * 0.72).toBeCloseTo(200);
    expect(layout.top + baseline + layout.fontSize * 0.02).toBeCloseTo(300);
  });

  it('fits multi-line visible ink using Fabric baseline spacing', () => {
    const layout = fitDetectedTextToInkBox({
      lines: ['FIRST', 'SECOND', 'THIRD'],
      fontFamily: 'Test Sans',
      fontWeight: '400',
      fontStyle: 'normal',
      charSpacing: 0,
      lineHeight: 1.5,
      textAlign: 'center',
      targetBox: { left: 50, top: 80, width: 500, height: 200 },
      targetVisibleGlyphHeight: 80,
      constrainToDetectedBox: true,
      measureLine: (line, fontSize) => ({
        advanceWidth: line.length * fontSize * 0.55,
        inkLeft: 0,
        inkRight: line.length * fontSize * 0.55,
        ascent: fontSize * 0.74,
        descent: fontSize * 0.02,
      }),
    });

    const expectedInkUnits = 0.74 + 2 * 1.13 * 1.5 + 0.02;
    expect(layout.fontSize).toBeCloseTo(200 / expectedInkUnits);
    expect(layout.width * layout.scaleX).toBeCloseTo(500);
    const firstBaseline = layout.fontSize * 1.13 * (1 - 0.222);
    const lastBaseline = firstBaseline + 2 * layout.fontSize * 1.13 * 1.5;
    expect(layout.top + firstBaseline - layout.fontSize * 0.74).toBeCloseTo(80);
    expect(layout.top + lastBaseline + layout.fontSize * 0.02).toBeCloseTo(280);
  });

  it('does not enlarge text to fill a loose detection box', () => {
    const layout = fitDetectedTextToInkBox({
      lines: ['PRESENTS'],
      fontFamily: 'Test Sans',
      fontWeight: '400',
      fontStyle: 'normal',
      charSpacing: 0,
      lineHeight: 1.16,
      textAlign: 'center',
      targetBox: { left: 100, top: 200, width: 600, height: 300 },
      targetVisibleGlyphHeight: 60,
      constrainToDetectedBox: true,
      measureLine: (line, fontSize) => ({
        advanceWidth: line.length * fontSize * 0.5,
        inkLeft: 0,
        inkRight: line.length * fontSize * 0.5,
        ascent: fontSize * 0.72,
        descent: fontSize * 0.02,
      }),
    });

    expect(layout.fontSize).toBeCloseTo(60 / 0.74);
    expect(layout.fontSize).toBeLessThan(300 / 0.74);
    expect(layout.scaleX).toBe(1);
    expect(layout.width).toBe(600);
  });

  it('shrinks an over-wide line uniformly without horizontal distortion', () => {
    const layout = fitDetectedTextToInkBox({
      lines: ['VERY WIDE HEADING'],
      fontFamily: 'Test Sans',
      fontWeight: '700',
      fontStyle: 'normal',
      charSpacing: 0,
      lineHeight: 1.16,
      textAlign: 'center',
      targetBox: { left: 20, top: 30, width: 240, height: 100 },
      targetVisibleGlyphHeight: 74,
      constrainToDetectedBox: true,
      measureLine: (line, fontSize) => ({
        advanceWidth: line.length * fontSize * 0.6,
        inkLeft: 0,
        inkRight: line.length * fontSize * 0.6,
        ascent: fontSize * 0.72,
        descent: fontSize * 0.02,
      }),
    });

    expect(layout.fontSize).toBeLessThan(74 / 0.74);
    expect(layout.scaleX).toBe(1);
    expect(layout.width).toBeCloseTo(240);
  });

  it('reduces an over-wide detected heading uniformly instead of stretching it', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'activities_heading',
          kind: 'text',
          label: 'Activities heading',
          text: 'ACTIVITIES INCLUDE:',
          fontFamily: 'anton',
          fontSizeRatio: 0.08,
          visibleLineCount: 1,
          box: { x: 0.1, y: 0.1, width: 0.25, height: 0.1 },
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1000,
      },
      referenceGuideOpacity: 0,
    });

    const heading = compiled.project.elements[0];
    expect(heading).toMatchObject({ type: 'text', text: 'ACTIVITIES INCLUDE:' });
    if (heading?.type !== 'text') throw new Error('Expected flat text.');
    expect(heading.fontSize).toBeLessThan(80);
    expect(heading.scaleX).toBe(1);
    expect((heading.width ?? 0) * heading.scaleX).toBeCloseTo(250);
  });

  it('includes detected line spacing when limiting multi-line text height', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'body_copy',
          kind: 'text',
          label: 'Body copy',
          text: 'FIRST LINE\nSECOND LINE\nTHIRD LINE',
          fontSizeRatio: 0.2,
          lineHeight: 1.5,
          visibleLineCount: 3,
          box: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1000,
      },
      referenceGuideOpacity: 0,
    });

    const body = compiled.project.elements[0];
    if (body?.type !== 'text') throw new Error('Expected flat text.');
    expect(body.fontSize).toBeGreaterThan(40);
    expect(body.fontSize).toBeLessThan(55);
  });

  it('keeps a clipped outlined circle native, circular, and outside the canvas', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'corner_ring',
          kind: 'circle',
          label: 'Clipped corner ring',
          box: { x: 0.78, y: -0.08, width: 0.36, height: 0.34 },
          fill: null,
          stroke: '#ff654f',
          strokeWidthRatio: 0.025,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1000,
      },
      referenceGuideOpacity: 0,
    });

    const ring = compiled.project.elements[0];
    expect(ring).toMatchObject({
      type: 'circle',
      left: 785,
      top: -85,
      radius: 175,
      scaleX: 1,
      scaleY: 1,
      fill: 'transparent',
      stroke: '#ff654f',
      strokeWidth: 25,
    });
  });

  it('compiles regular triangles and stars as native editable shapes', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'triangle',
          kind: 'triangle',
          label: 'Triangle',
          box: { x: 0.1, y: 0.1, width: 0.2, height: 0.15 },
        }),
        element({
          key: 'star',
          kind: 'star',
          label: 'Five-point star',
          box: { x: 0.4, y: 0.1, width: 0.2, height: 0.2 },
          zIndex: 2,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1000,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'triangle',
      width: 200,
      height: 150,
    });
    const star = compiled.project.elements[1];
    expect(star).toMatchObject({ type: 'polygon' });
    if (star?.type !== 'polygon') throw new Error('Expected a native polygon star.');
    expect(star.polygonPoints).toHaveLength(10);
  });

  it('preserves the full length of horizontal and vertical native lines', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'horizontal_divider',
          kind: 'line',
          label: 'Horizontal divider',
          box: { x: 0.1, y: 0.2, width: 0.6, height: 0.01 },
          angle: 0,
          fill: null,
          stroke: '#ff654f',
          strokeWidthRatio: 0.01,
        }),
        element({
          key: 'vertical_divider',
          kind: 'line',
          label: 'Vertical divider',
          box: { x: 0.75, y: 0.2, width: 0.01, height: 0.5 },
          angle: 90,
          fill: null,
          stroke: '#ffffff',
          strokeWidthRatio: 0.008,
          zIndex: 2,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1000,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'line',
      left: 100,
      top: 205,
      angle: 0,
      x1: 0,
      y1: 0,
      x2: 600,
      y2: 0,
      strokeWidth: 10,
    });
    expect(compiled.project.elements[1]).toMatchObject({
      type: 'line',
      left: 755,
      top: 200,
      angle: 0,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 500,
      strokeWidth: 8,
    });
  });

  it('applies detected image masks to reconstructed photo regions', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'classroom_photo',
          kind: 'image_region',
          label: 'Circular classroom photo',
          imageRole: 'photo',
          imageMask: 'circle',
          replacementRecommended: true,
          replacementReason: 'the source crop is contaminated',
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'image',
      mask: 'circle',
      edge: 'none',
    });
  });

  it('preserves a detected bottom-only image fade instead of reversing it', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'speaker',
          kind: 'image_region',
          label: 'Speaker cutout with bottom fade',
          imageRole: 'person',
          imageCutout: true,
          imageEdge: 'fade',
          imageFadeDirection: 'bottom',
          imageFadeAmount: 0.28,
          imageFadeMinOpacity: 0.08,
          replacementRecommended: true,
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1000,
        height: 1500,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'image',
      edge: 'fade',
      edgeFadeDirection: 'bottom',
      edgeFadeAmount: 0.28,
      edgeFadeMinOpacity: 0.08,
    });
  });

  it.each(['location', 'phone', 'web'] as const)(
    'rebuilds the supplied %s design as a clean tintable SVG layer',
    async (iconName) => {
      const compiled = await compilePosterReconstruction({
        plan: plan([
          element({
            key: `${iconName}_icon`,
            kind: 'image_region',
            label: `${iconName} icon`,
            box: { x: 0.05, y: 0.8, width: 0.08, height: 0.06 },
            imageRole: 'icon',
            iconName,
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
      expect(icon).toMatchObject({ type: 'image', layerName: `AI icon: ${iconName} icon` });
      if (icon?.type !== 'image') throw new Error('Expected an icon image.');
      const svg = decodeURIComponent(icon.src);
      expect(svg).toContain('fill="#176143"');
      expect(svg).toContain('<image href="data:image/png;base64,');
      expect(svg).toContain('mask="url(#icon-silhouette)"');
    },
  );

  it.each([
    'facebook',
    'instagram',
    'youtube',
    'x',
    'tiktok',
    'linkedin',
    'whatsapp',
  ] as const)('rebuilds the %s social icon from a local tintable SVG asset', async (iconName) => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: `${iconName}_icon`,
          kind: 'image_region',
          label: `${iconName} social icon`,
          box: { x: 0.05, y: 0.8, width: 0.08, height: 0.06 },
          imageRole: 'icon',
          iconName,
          imageDominantColor: '#2878c7',
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
    expect(icon).toMatchObject({ type: 'image', layerName: `AI icon: ${iconName} social icon` });
    if (icon?.type !== 'image') throw new Error('Expected a social icon image.');
    const svg = decodeURIComponent(icon.src);
    expect(svg).toContain('fill="#2878c7"');
    expect(svg).toContain('<path');
    expect(svg).not.toContain('iVBORw0KGgo');
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
          pathUsage: 'closed_fill',
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

  it('closes and fills a footer panel when its decorative wave separates two regions', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'white_footer_wave',
          kind: 'path',
          label: 'White footer beneath pink wave',
          box: { x: 0, y: 0.72, width: 1, height: 0.28 },
          fill: '#ffffff',
          stroke: '#d31370',
          strokeWidthRatio: 0.006,
          pathUsage: 'closed_fill',
          pathClosed: false,
          pathPoints: [
            { x: 0, y: 0.02, smooth: false },
            { x: 0.34, y: 0.36, smooth: true },
            { x: 0.65, y: 0.16, smooth: true },
            { x: 1, y: 0.28, smooth: false },
            { x: 1, y: 1, smooth: false },
            { x: 0, y: 1, smooth: false },
          ],
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 904,
        height: 1280,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'path',
      fill: '#ffffff',
      fillOpacity: 1,
      stroke: '#d31370',
      closed: true,
    });
    expect(compiled.warnings).toContain(
      '“White footer beneath pink wave” had conflicting path geometry; its filled region was closed.',
    );
  });

  it('repairs an otherwise invisible filled band that was misclassified as an open stroke', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'yellow_footer_band',
          kind: 'path',
          label: 'Yellow curved footer band',
          box: { x: 0, y: 0.72, width: 1, height: 0.28 },
          fill: '#f3cf24',
          stroke: null,
          strokeWidthRatio: 0,
          pathUsage: 'open_stroke',
          pathClosed: false,
          pathPoints: [
            { x: 0, y: 0.88, smooth: false },
            { x: 0.38, y: 0.96, smooth: true },
            { x: 0.72, y: 0.18, smooth: true },
            { x: 1, y: 0, smooth: false },
            { x: 1, y: 1, smooth: false },
            { x: 0, y: 1, smooth: false },
          ],
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 904,
        height: 1280,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'path',
      fill: '#f3cf24',
      fillOpacity: 1,
      stroke: undefined,
      strokeWidth: 0,
      closed: true,
    });
    expect(compiled.warnings).toContain(
      '“Yellow curved footer band” supplied a fill but no visible stroke, so it was repaired as a closed filled path.',
    );
  });

  it('removes fill and closure from a standalone decorative stroke', async () => {
    const compiled = await compilePosterReconstruction({
      plan: plan([
        element({
          key: 'standalone_swoosh',
          kind: 'path',
          label: 'Standalone swoosh',
          fill: '#ffffff',
          stroke: '#d31370',
          strokeWidthRatio: 0.006,
          pathUsage: 'open_stroke',
          pathClosed: true,
          pathPoints: [
            { x: 0, y: 0.2, smooth: false },
            { x: 0.5, y: 0.8, smooth: true },
            { x: 1, y: 0.2, smooth: false },
          ],
        }),
      ]),
      reference: {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        width: 904,
        height: 1280,
      },
      referenceGuideOpacity: 0,
    });

    expect(compiled.project.elements[0]).toMatchObject({
      type: 'path',
      fill: 'transparent',
      fillOpacity: 0,
      stroke: '#d31370',
      closed: false,
    });
    expect(compiled.warnings).toContain(
      '“Standalone swoosh” was classified as a standalone open stroke, so its fill was removed.',
    );
  });
});

describe('PosterReconstructionPlanSchema', () => {
  it('accepts limited overflow for regular geometry clipped by the canvas', () => {
    expect(plan([
      element({
        kind: 'circle',
        box: { x: 0.8, y: -0.12, width: 0.4, height: 0.4 },
      }),
    ]).elements[0].box).toEqual({ x: 0.8, y: -0.12, width: 0.4, height: 0.4 });
  });

  it('keeps older cached elements readable with neutral detail defaults', () => {
    const current = plan([element({ kind: 'text', text: 'Legacy heading' })]);
    const {
      visibleLineCount: _visibleLineCount,
      cornerStyle: _cornerStyle,
      imageMask: _imageMask,
      imageCutout: _imageCutout,
      imageEdge: _imageEdge,
      imageFadeDirection: _imageFadeDirection,
      imageFadeAmount: _imageFadeAmount,
      imageFadeMinOpacity: _imageFadeMinOpacity,
      textFillType: _textFillType,
      textFillStart: _textFillStart,
      textFillEnd: _textFillEnd,
      textFillAngle: _textFillAngle,
      pathUsage: _pathUsage,
      ...legacyElement
    } = current.elements[0];
    const parsed = PosterReconstructionPlanSchema.parse({
      ...current,
      elements: [legacyElement],
    });

    expect(parsed.elements[0]).toMatchObject({
      visibleLineCount: 0,
      cornerStyle: 'auto',
      imageMask: 'none',
      imageCutout: false,
      imageEdge: 'none',
      imageFadeDirection: 'radial',
      imageFadeAmount: 0.35,
      imageFadeMinOpacity: 0,
      textFillType: 'solid',
      textFillStart: null,
      textFillEnd: null,
      textFillAngle: 0,
      pathUsage: 'not_applicable',
    });
  });

  it('rejects arbitrary executable fields', () => {
    const unsafe = {
      ...createFallbackReconstructionPlan(),
      javascript: 'fetch("https://example.test")',
    };
    expect(PosterReconstructionPlanSchema.safeParse(unsafe).success).toBe(false);
  });
});
