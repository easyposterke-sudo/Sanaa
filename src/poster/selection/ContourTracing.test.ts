import { describe, it, expect, vi } from 'vitest';
import { DetectionEngine } from './DetectionEngine';

describe('DetectionEngine Contour Tracing', () => {
  const mockCanvas = {
    getObjects: vi.fn(),
  } as any;

  const engine = new DetectionEngine(mockCanvas);

  it('isBoundary identifies edge pixels correctly', () => {
    // 3x3 mask with a single pixel in the middle
    const mask = new Uint8Array([
      0, 0, 0,
      0, 1, 0,
      0, 0, 0
    ]);
    const width = 3;
    const height = 3;

    expect((DetectionEngine as any).isBoundary(1, 1, mask, width, height)).toBe(true);
    expect((DetectionEngine as any).isBoundary(0, 0, mask, width, height)).toBe(false);
  });

  it('traceContour traces a simple square correctly', () => {
    // 4x4 mask with a 2x2 square in the middle
    const mask = new Uint8Array([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 0, 0
    ]);
    const width = 4;
    const height = 4;
    const visited = new Uint8Array(width * height);

    const result = (DetectionEngine as any).traceContour(1, 1, mask, width, height, visited);

    // Moore tracing should find 4 points for a 2x2 square
    expect(result.length).toBe(4);
    expect(result).toContainEqual({ x: 1, y: 1 });
    expect(result).toContainEqual({ x: 2, y: 1 });
    expect(result).toContainEqual({ x: 2, y: 2 });
    expect(result).toContainEqual({ x: 1, y: 2 });
  });

  it('getContourPoints finds multiple islands', async () => {
    const mockImage = {
      getElement: () => {
        const canvas = { width: 10, height: 10 };
        return canvas;
      },
      calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
      originX: 'left',
      originY: 'top'
    } as any;

    // Mock document.createElement('canvas')
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: () => ({
        data: Array.from({ length: 10 * 10 * 4 }, (_, i) => {
          // Create two 3x3 squares
          const x = Math.floor(i / 4) % 10;
          const y = Math.floor(Math.floor(i / 4) / 10);
          const isSquare1 = x >= 1 && x <= 3 && y >= 1 && y <= 3;
          const isSquare2 = x >= 5 && x <= 7 && y >= 5 && y <= 7;
          if (i % 4 === 3) return (isSquare1 || isSquare2) ? 255 : 0;
          return 0;
        })
      })
    };
    const mockCanvas = {
      getContext: () => mockCtx,
      width: 10,
      height: 10
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

    const result = await (engine as any).getContourPointsLocal(mockImage);
    expect(result?.length).toBe(2);
    // Simplified square might have fewer points but should be >= 2
    expect(result![0].length).toBeGreaterThanOrEqual(2);
    expect(result![1].length).toBeGreaterThanOrEqual(2);
  });

  it('simplifyPath reduces points while maintaining shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 }
    ];

    const simplified = (DetectionEngine as any).simplifyPath(points, 1);

    // The point at (5, 0.1) should be removed as it's within tolerance of the line (0,0)-(10,0)
    expect(simplified.length).toBe(5);
    expect(simplified).not.toContainEqual({ x: 5, y: 0.1 });
  });
});
