import { afterEach, expect, it, vi } from 'vitest';
import { compilePosterReconstruction } from './compilePosterReconstruction';
import { referenceElement, referencePlan } from './referenceTestFixtures';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('extracts original source pixels independently of the selected output size', async () => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,AAAA');
  const sources: string[] = [];
  vi.stubGlobal('Image', class {
    naturalWidth = 4000; naturalHeight = 2000;
    onload: (() => void) | null = null;
    set src(value: string) { sources.push(value); queueMicrotask(() => this.onload?.()); }
  });
  const plan = referencePlan([referenceElement({ kind: 'image_region', imageRole: 'photo', box: { x: .25, y: .1, width: .5, height: .4 } })]);
  const compiled = await compilePosterReconstruction({ plan, reference: { dataUrl: 'analysis', originalDataUrl: 'original', width: 1000, height: 500 }, canvasSize: { width: 2000, height: 1000 }, referenceGuideOpacity: 0 });
  expect(sources).toEqual(['original']);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 1000, 200, 2000, 800, 0, 0, 2000, 800);
  expect(compiled.project.elements[0]).toMatchObject({ left: 500, top: 100, scaleX: .5, scaleY: .5 });
});
