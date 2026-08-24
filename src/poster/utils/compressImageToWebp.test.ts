import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImageToWebp } from './compressImageToWebp';

describe('compressImageToWebp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('converts and downsizes a PNG into a WebP file', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-image');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    class TestImage {
      naturalWidth = 5000;
      naturalHeight = 2500;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', TestImage);

    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      expect(type).toBe('image/webp');
      expect(quality).toBe(0.8);
      callback(new Blob(['compressed-webp'], { type: 'image/webp' }));
    });
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
      }),
      toBlob,
    } as unknown as HTMLCanvasElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
      tagName === 'canvas' ? fakeCanvas : createElement(tagName),
    );

    const source = new File([new Uint8Array(200)], 'large-poster.png', { type: 'image/png' });
    const result = await compressImageToWebp(source, { maxLongEdge: 2000, quality: 0.8 });

    expect(result.file.name).toBe('large-poster.webp');
    expect(result.file.type).toBe('image/webp');
    expect(result.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1000);
    expect(result.originalBytes).toBe(200);
    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
  });

  it('rejects formats that should not be flattened into WebP', async () => {
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await expect(compressImageToWebp(svg)).rejects.toThrow('PNG, JPEG, or WebP');
  });
});
