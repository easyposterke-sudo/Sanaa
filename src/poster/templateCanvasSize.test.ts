import { describe, expect, it } from 'vitest';
import {
  normalizeTemplateCanvasDimension,
  recommendTemplateCanvasSize,
  templateCanvasOrientation,
} from './templateCanvasSize';

describe('AI template canvas size recommendations', () => {
  it('promotes a small square reference to the standard 1080 square', () => {
    expect(recommendTemplateCanvasSize(528, 528)).toMatchObject({
      id: 'square',
      width: 1080,
      height: 1080,
    });
  });

  it('recognizes story, landscape, and A4-like references by aspect ratio', () => {
    expect(recommendTemplateCanvasSize(720, 1280).id).toBe('portrait-story');
    expect(recommendTemplateCanvasSize(1280, 720).id).toBe('landscape-hd');
    expect(recommendTemplateCanvasSize(794, 1123).id).toBe('a4-portrait');
    expect(recommendTemplateCanvasSize(1123, 794).id).toBe('a4-landscape');
  });

  it('labels orientation and keeps custom sizes within the editor limit', () => {
    expect(templateCanvasOrientation(1080, 1080)).toBe('Square');
    expect(templateCanvasOrientation(1080, 1920)).toBe('Portrait');
    expect(templateCanvasOrientation(1920, 1080)).toBe('Landscape');
    expect(normalizeTemplateCanvasDimension(12, 1080)).toBe(64);
    expect(normalizeTemplateCanvasDimension(9000, 1080)).toBe(4096);
  });
});
