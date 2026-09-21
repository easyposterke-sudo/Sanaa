import { describe, expect, it } from 'vitest';
import { isShapeLayer } from '../core/types';
import type { PosterTextElement } from './types';
import { posterTextToTwoLayer3D } from './convertPosterTextTo3D';

const source: PosterTextElement = {
  id: 'headline',
  type: 'text',
  text: 'SUMMIT',
  fontFamily: '"Montserrat", sans-serif',
  fontSize: 64,
  fontWeight: '700',
  charSpacing: 40,
  fill: '#eeddcc',
  width: 450,
  left: 75,
  top: 42,
  scaleX: 1.2,
  scaleY: 1.2,
  angle: 12,
  opacity: 0.8,
  zIndex: 5,
  layerName: 'Headline',
};

describe('posterTextToTwoLayer3D', () => {
  it('keeps the selected layer and typography while applying two separate colors', () => {
    const result = posterTextToTwoLayer3D(source, '#eeddcc', '#123456');
    expect(result.id).toBe(source.id);
    expect(result.type).toBe('3d-text');
    expect(result.layerName).toBe(source.layerName);
    expect(result.zIndex).toBe(source.zIndex);
    expect(result.left).toBe(source.left);
    expect(result.top).toBe(source.top);
    expect(result.angle).toBe(source.angle);
    expect(result.opacity).toBe(source.opacity);
    expect(result.config.text?.fontFamily).toBe(source.fontFamily);
    expect(result.config.text?.fontWeight).toBe('700');
    expect(result.config.text?.content).toBe(source.text);
    expect(result.config.textLayers).toHaveLength(2);
    expect(result.config.textLayers?.[0]?.extrusionColor).toBe('#123456');
    expect(result.config.textLayers?.[1]?.frontColor).toBe('#eeddcc');
    expect(result.image).toContain('data:image/svg+xml');
    expect(result.previewWidth).toBeGreaterThan(0);
  });

  it('keeps the selected custom font available to both 3D layers', () => {
    const result = posterTextToTwoLayer3D(source, '#ffffff', '#000000', 'cloud-font-9');
    expect(result.config.selectedCustomFontId).toBe('cloud-font-9');
    expect(result.config.textLayers?.every((layer) => !isShapeLayer(layer) && layer.selectedCustomFontId === 'cloud-font-9')).toBe(true);
  });

  it('rejects content the two-layer recipe cannot render', () => {
    expect(() => posterTextToTwoLayer3D({ ...source, text: 'one\ntwo' }, '#ffffff', '#000000')).toThrow(/single line/);
    expect(() => posterTextToTwoLayer3D({ ...source, text: 'x'.repeat(81) }, '#ffffff', '#000000')).toThrow(/1–80/);
  });
});
