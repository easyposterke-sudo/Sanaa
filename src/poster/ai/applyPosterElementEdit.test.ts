import { describe, expect, it } from 'vitest';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION, type PosterReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import type { PosterElement, PosterTextElement } from '../types';
import { applyPosterElementEdit, sanitizedPosterElementProperties } from './applyPosterElementEdit';

describe('applyPosterElementEdit', () => {
  it('atomically replaces only the selected layer and can split it into independent text', async () => {
    const background = rectangle('background', 1);
    const selected = text('date', 'SUN 10 JUNE 2026', 2);
    const footer = text('footer', '123 ANYWHERE ST.', 3);
    const patch = plan([
      reconstructionText('day', 'SUN', { x: 0.1, y: 0.8, width: 0.08, height: 0.04 }, 1),
      reconstructionText('number', '10', { x: 0.18, y: 0.77, width: 0.13, height: 0.09 }, 2),
      reconstructionText('month_year', 'JUNE\n2026', { x: 0.31, y: 0.79, width: 0.14, height: 0.07 }, 3),
    ]);

    const result = await applyPosterElementEdit({
      elements: [background, selected, footer],
      selectedId: selected.id,
      patch,
      reference: { dataUrl: 'data:image/png;base64,AAAA', width: 1000, height: 1000 },
      canvasWidth: 1000,
      canvasHeight: 1000,
    });

    expect(result.elements).toHaveLength(5);
    expect(result.elements[0]).toBe(background);
    expect(result.elements[4]).toBe(footer);
    expect(result.replacementIds).toEqual(['date', 'date_ai_2', 'date_ai_3']);
    expect(result.elements.slice(1, 4).map((element) => element.type === 'text' ? element.text : '')).toEqual([
      'SUN', '10', 'JUNE\n2026',
    ]);
    expect(result.elements.slice(1, 4).map((element) => element.zIndex)).toEqual([2, 2.001, 2.002]);
  });

  it('removes raster payloads from the selected-layer properties sent to AI', () => {
    const properties = sanitizedPosterElementProperties({
      id: 'photo', type: 'image', src: 'data:image/png;base64,SECRET', originalSrc: 'data:image/png;base64,ORIGINAL',
      left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1,
    });
    expect(properties).not.toContain('SECRET');
    expect(properties).not.toContain('ORIGINAL');
  });
});

function plan(elements: ReturnType<typeof reconstructionText>[]): PosterReconstructionPlan {
  return {
    schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
    suggestedTemplateName: 'Selected layer edit',
    category: 'general',
    summary: 'Matched the selected date to the reference.',
    canvas: { backgroundType: 'solid', backgroundTop: '#ffffff', backgroundBottom: '#ffffff', gradientAngle: 0 },
    elements,
    warnings: [],
    confidence: 0.95,
  };
}

function reconstructionText(key: string, value: string, box: { x: number; y: number; width: number; height: number }, zIndex: number) {
  return {
    key, kind: 'text' as const, label: value, box, angle: 0, opacity: 1, zIndex,
    fill: '#111111', textFillType: 'solid' as const, textFillStart: null, textFillEnd: null, textFillAngle: 0,
    stroke: null, strokeWidthRatio: 0, text: value, fontFamily: 'anton' as const, fontCatalogId: null,
    fontSizeRatio: 0.04, fontWeight: '700' as const, fontStyle: 'normal' as const,
    textAlign: 'left' as const, charSpacing: -20, lineHeight: 1, visibleLineCount: value.split('\n').length,
    textCurve: 0, textEffect: 'flat' as const, textHasVisibleExtrusion: false, textExtrusionDepthRatio: 0,
    extrusionColor: null, cornerRadiusRatio: 0, cornerStyle: 'auto' as const, pathPoints: [],
    pathUsage: 'not_applicable' as const, pathClosed: false, pathTension: 0.28,
    imageRole: 'none' as const, imageMask: 'none' as const, imageCutout: false, imageEdge: 'none' as const,
    imageFadeDirection: 'radial' as const, imageFadeAmount: 0.35, imageFadeMinOpacity: 0,
    imageBrightness: 0, imageContrast: 0, imageSaturation: 0, imageBlur: 0,
    imageTintColor: null, imageTintAmount: 0, imageHasOverlays: false, replacementRecommended: false,
    replacementReason: '', imageSearchQuery: '', imageDominantColor: null, iconName: 'none' as const,
    suggestedFieldKey: null, suggestedFieldLabel: '', confidence: 0.95,
  };
}

function text(id: string, value: string, zIndex: number): PosterTextElement {
  return {
    id, type: 'text', text: value, fontSize: 40, fontFamily: 'Arial', fill: '#111111', width: 300,
    left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex,
  };
}

function rectangle(id: string, zIndex: number): PosterElement {
  return {
    id, type: 'rect', width: 1000, height: 1000, fill: { type: 'solid', color: '#ffffff' },
    left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex,
    stroke: 'transparent', strokeWidth: 0, rx: 0, ry: 0,
  };
}
