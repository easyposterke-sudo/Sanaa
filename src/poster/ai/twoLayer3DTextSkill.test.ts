import { describe, expect, it } from 'vitest';
import { isShapeLayer, type TextLayer3D } from '../../core/types';
import { syncLayersFromMerged } from '../../core/textLayerHelpers';
import {
  TWO_LAYER_3D_TEXT_RECIPE_ID,
  TwoLayer3DTextSkillInputSchema,
  compileTwoLayer3DTextElement,
  compileTwoLayer3DTextState,
  fitTwoLayer3DTextPlacement,
  renderTwoLayer3DTextPreview,
} from './twoLayer3DTextSkill';

function recipeLayers(state: ReturnType<typeof compileTwoLayer3DTextState>): [TextLayer3D, TextLayer3D] {
  const layers = (state.textLayers ?? []).filter(
    (layer): layer is TextLayer3D => !isShapeLayer(layer),
  );
  const [rear, front] = layers;
  if (layers.length !== 2 || !rear || !front) {
    throw new Error('Expected exactly two text layers.');
  }
  return [rear, front];
}

describe('compileTwoLayer3DTextState', () => {
  it('reproduces the accepted face-and-shell construction with shared typography', () => {
    const state = compileTwoLayer3DTextState({ text: 'CONFERENCE' });
    const [rear, front] = recipeLayers(state);

    expect(state.textLayers).toHaveLength(2);
    expect(state.environmentId).toBe('golden');
    expect(state.activeTextLayerId).toBe(`${TWO_LAYER_3D_TEXT_RECIPE_ID}:front-face`);
    expect(rear.id).toBe(`${TWO_LAYER_3D_TEXT_RECIPE_ID}:rear-shell`);
    expect(rear.extrusionOnly).toBe(true);
    expect(rear.positionZ).toBe(0);
    expect(rear.extrusion.depth).toBe(2);
    expect(rear.extrusionColor).toBe('#000000');
    expect(front.extrusionOnly).toBe(false);
    expect(front.positionZ).toBe(0.2);
    expect(front.extrusion.depth).toBe(1);
    expect(front.frontColor).toBe('#ffffff');
    expect(rear.text).toEqual(front.text);
    expect(rear.selectedCustomFontId).toBe(front.selectedCustomFontId);
    expect(rear.linkedTypographyGroupId).toBe(front.linkedTypographyGroupId);
  });

  it('varies only declared content, typography, colors, environment, camera, and transform', () => {
    const input = {
      text: 'SUMMIT',
      fontFamily: 'Arial Black, sans-serif',
      customFontId: 'brand-font-1',
      fontSize: 88,
      fontWeight: '900',
      letterSpacing: 3,
      faceColor: '#f4efe3',
      extrusionColor: '#175f44',
      environmentId: 'silver' as const,
      cameraPose: {
        position: { x: 1.25, y: -0.5, z: 8 },
        target: { x: 0, y: 0, z: 0 },
        fov: 38,
        zoom: 1.1,
      },
      sceneTransform: { positionX: 0.4, positionY: -0.3, scale: 1.25 },
    };
    const first = compileTwoLayer3DTextState(input);
    const second = compileTwoLayer3DTextState(input);
    const [rear, front] = recipeLayers(first);

    expect(first).toEqual(second);
    expect(rear.text).toEqual({
      content: 'SUMMIT',
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 88,
      fontWeight: '900',
      letterSpacing: 3,
    });
    expect(front.text).toEqual(rear.text);
    expect(rear.selectedCustomFontId).toBe('brand-font-1');
    expect(front.selectedCustomFontId).toBe('brand-font-1');
    expect(rear.extrusionColor).toBe('#175f44');
    expect(front.frontColor).toBe('#f4efe3');
    expect(rear.positionX).toBe(front.positionX);
    expect(rear.positionY).toBe(front.positionY);
    expect(rear.scale).toBe(front.scale);
    expect(first.cameraPose).toEqual(input.cameraPose);
    expect(first.environmentId).toBe('silver');
  });

  it('rejects undeclared or unsafe recipe parameters', () => {
    expect(
      TwoLayer3DTextSkillInputSchema.safeParse({ text: 'MEN', arbitraryDepth: 99 }).success,
    ).toBe(false);
    expect(
      TwoLayer3DTextSkillInputSchema.safeParse({ text: 'MEN', faceColor: 'white' }).success,
    ).toBe(false);
    expect(
      TwoLayer3DTextSkillInputSchema.safeParse({
        recipeId: 'another-recipe-v1',
        text: 'MEN',
      }).success,
    ).toBe(false);
  });

  it('renders an immediate poster preview with both face and shell colors', () => {
    const state = compileTwoLayer3DTextState({
      text: `MEN'S & CONFERENCE`,
      faceColor: '#f4efe3',
      extrusionColor: '#175f44',
    });
    const svg = renderTwoLayer3DTextPreview(state);

    expect(svg).toContain('#f4efe3');
    expect(svg).toContain('#175f44');
    expect(svg).toContain('two-layer-shell');
    expect(svg).toContain('MEN&apos;S &amp; CONFERENCE');
    expect(svg).toMatch(/<svg[^>]+width="\d+"[^>]+height="\d+"/);
  });

  it('replaces invalid XML characters before poster data-URL encoding', () => {
    const state = compileTwoLayer3DTextState({ text: `MEN\u0000\ud800` });
    const svg = renderTwoLayer3DTextPreview(state);

    expect(svg).not.toContain('\u0000');
    expect(() => encodeURIComponent(svg)).not.toThrow();
    expect(svg).toContain('\ufffd');
  });

  it('keeps ordinary editor text and font changes linked without copying materials', () => {
    const state = compileTwoLayer3DTextState({ text: 'MEN' });
    const changed = {
      ...state,
      text: {
        ...state.text,
        content: 'CONFERENCE',
        fontFamily: 'Arial Black, sans-serif',
      },
    };
    const synchronized = syncLayersFromMerged(changed).textLayers;
    const [rear, front] = synchronized.filter(
      (layer): layer is TextLayer3D => !isShapeLayer(layer),
    );

    expect(rear?.text).toEqual(changed.text);
    expect(front?.text).toEqual(changed.text);
    expect(rear?.extrusionColor).toBe('#000000');
    expect(front?.frontColor).toBe('#ffffff');
  });
});

describe('fitTwoLayer3DTextPlacement', () => {
  it('contains and centers a transparent export without stretching it', () => {
    expect(
      fitTwoLayer3DTextPlacement({
        sourceWidth: 1200,
        sourceHeight: 400,
        box: { left: 100, top: 200, width: 600, height: 300 },
      }),
    ).toEqual({
      left: 100,
      top: 250,
      scaleX: 0.5,
      scaleY: 0.5,
      angle: 0,
      opacity: 1,
    });
  });

  it('supports explicit poster scaling and stretch fit', () => {
    expect(
      fitTwoLayer3DTextPlacement({
        sourceWidth: 100,
        sourceHeight: 50,
        box: { left: 10, top: 20, width: 300, height: 200 },
        fit: 'stretch',
        alignX: 0.5,
        alignY: 0.5,
        scale: 0.8,
        angle: -5,
        opacity: 0.9,
      }),
    ).toEqual({
      left: 40,
      top: 40,
      scaleX: 2.4,
      scaleY: 3.2,
      angle: -5,
      opacity: 0.9,
    });
  });
});

describe('compileTwoLayer3DTextElement', () => {
  it('keeps the poster preview and editable recipe configuration together', () => {
    const element = compileTwoLayer3DTextElement({
      id: 'title-3d',
      layerName: 'Title 3D',
      image: 'data:image/webp;base64,AA==',
      skill: {
        text: 'MEN',
        fontFamily: 'Georgia, serif',
        faceColor: '#ffffff',
        extrusionColor: '#005a35',
      },
      placement: {
        sourceWidth: 600,
        sourceHeight: 200,
        box: { left: 80, top: 150, width: 640, height: 240 },
      },
    });

    expect(element.type).toBe('3d-text');
    expect(element.left).toBe(80);
    expect(element.top).toBeCloseTo(163.3333333333);
    expect(element.scaleX).toBeCloseTo(1.0666666667);
    expect(element.scaleY).toBeCloseTo(1.0666666667);
    expect(element.config.textLayers).toHaveLength(2);
    expect(
      element.config.textLayers?.every(
        (layer) => !isShapeLayer(layer) && layer.text.fontFamily === 'Georgia, serif',
      ),
    ).toBe(true);
  });
});
