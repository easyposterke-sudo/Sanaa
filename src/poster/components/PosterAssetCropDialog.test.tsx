import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import { cropPosterAsset } from '../ai/cropPosterAsset';
import { PosterAssetCropDialog } from './PosterAssetCropDialog';

vi.mock('../ai/cropPosterAsset', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ai/cropPosterAsset')>(),
  cropPosterAsset: vi.fn(),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('uses the original uploaded pixels for a manual crop while retaining normalized AI coordinates', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original-poster');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.mocked(cropPosterAsset).mockResolvedValue({ src: 'data:image/png;base64,AAAA', width: 400, height: 200, lossless: true });
  const onApply = vi.fn();
  render(<PosterAssetCropDialog
    reference={{ dataUrl: 'data:image/webp;base64,AAAA', width: 1200, height: 800, sourceWidth: 4000, sourceHeight: 2667, fileName: 'poster.png' }}
    sourceFile={new File(['original'], 'poster.png', { type: 'image/png' })}
    item={{ label: 'small icon', imageRole: 'icon', box: { x: 0.7, y: 0.2, width: 0.1, height: 0.1 } } as ReconstructionElement}
    onCancel={vi.fn()}
    onApply={onApply}
  />);
  fireEvent.click(screen.getByRole('button', { name: 'Use this crop' }));
  await waitFor(() => expect(cropPosterAsset).toHaveBeenCalledWith(
    { dataUrl: 'blob:original-poster', width: 4000, height: 2667 },
    { x: 0.7, y: 0.2, width: 0.1, height: 0.1 },
    false,
    undefined,
  ));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ lossless: true }), { x: 0.7, y: 0.2, width: 0.1, height: 0.1 });
});

it('resizes both rectangle and circle selections using the visible handles', async () => {
  render(<PosterAssetCropDialog
    reference={{ dataUrl: 'data:image/png;base64,AAAA', width: 1000, height: 1000, sourceWidth: 1000, sourceHeight: 1000, fileName: 'poster.png' }}
    item={{ label: 'mark', imageRole: 'icon', box: { x: 0.4, y: 0.3, width: 0.2, height: 0.1 } } as ReconstructionElement}
    onCancel={vi.fn()}
    onApply={vi.fn()}
  />);
  const viewport = screen.getByTestId('crop-viewport');
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 600 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 });
  fireEvent(window, new Event('resize'));
  const selection = await waitFor(() => {
    const element = viewport.querySelector<HTMLElement>('[data-crop-move]');
    expect(element).not.toBeNull();
    return element!;
  });
  const surface = selection.parentElement!;
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  surface.setPointerCapture = vi.fn();
  surface.hasPointerCapture = vi.fn().mockReturnValue(true);
  surface.releasePointerCapture = vi.fn();
  const resizeEast = (fromX: number, toX: number) => {
    fireEvent.pointerDown(selection.querySelector('[data-crop-handle="e"]')!, { button: 0, pointerId: 1, clientX: fromX, clientY: 140 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: toX, clientY: 140 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: toX, clientY: 140 });
  };
  resizeEast(360, 420);
  expect(parseFloat(selection.style.width)).toBeCloseTo(30);
  fireEvent.click(screen.getByRole('button', { name: 'Circle / ellipse' }));
  resizeEast(420, 480);
  expect(parseFloat(selection.style.width)).toBeCloseTo(40);
  expect(selection.className).toContain('rounded-full');
});
