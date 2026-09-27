import { describe, expect, it, vi } from 'vitest';
import { renderReferenceDraft } from './renderReferenceDraft';
import type { PosterProject, PosterShapeElement } from '../types';
import { usePosterStore } from '../store/posterStore';

vi.mock('../loadPosterFonts', () => ({ loadFontsForPosterElements: vi.fn().mockResolvedValue(undefined) }));

describe('reference comparison renderer', () => {
  it('renders actual editor shapes, z-order and background at the comparison size without the guide or store changes', async () => {
    const rect: PosterShapeElement = { id: 'panel', type: 'rect', left: 20, top: 20, width: 60, height: 60, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1, fill: { type: 'solid', color: '#ff0000' }, stroke: '', strokeWidth: 0 };
    const project: PosterProject = { canvasWidth: 100, canvasHeight: 100, canvasBackground: { type: 'solid', color: '#ffffff' }, elements: [
      { ...rect, id: 'guide', left: 0, top: 0, width: 100, height: 100, zIndex: 100, excludeFromExport: true, fill: { type: 'solid', color: '#000000' } },
      { ...rect, id: 'front', left: 40, top: 40, width: 20, height: 20, zIndex: 2, fill: { type: 'solid', color: '#0000ff' } }, rect,
    ] };
    const before = usePosterStore.getState();
    const surface = await renderReferenceDraft(project, 50);
    const pixel = (x: number, y: number) => [...surface.getContext('2d')!.getImageData(x, y, 1, 1).data];
    expect([surface.width, surface.height]).toEqual([50, 50]);
    expect(pixel(2, 2)).toEqual([255, 255, 255, 255]);
    expect(pixel(15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(25, 25)).toEqual([0, 0, 255, 255]);
    expect(usePosterStore.getState()).toBe(before);
    expect(project.elements.map(item => item.id)).toEqual(['guide', 'front', 'panel']);
  });
});
