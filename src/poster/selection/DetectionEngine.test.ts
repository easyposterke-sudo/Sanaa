import { describe, it, expect, vi } from 'vitest';
import { DetectionEngine } from './DetectionEngine';

describe('DetectionEngine', () => {
  const mockCanvas = {
    getObjects: vi.fn(),
  } as any;

  const engine = new DetectionEngine(mockCanvas);

  describe('generatePrecisePath', () => {
    it('returns precise points for a polygon', async () => {
      const mockPolygon = {
        type: 'polygon',
        data: { posterId: 'test-id' },
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        width: 10,
        height: 10,
        originX: 'left',
        originY: 'top',
        calcTransformMatrix: () => [1, 0, 0, 1, 100, 100], // Identity + 100px offset
      } as any;

      mockCanvas.getObjects.mockReturnValue([mockPolygon]);

      const result = await engine.generatePrecisePath('test-id');

      expect(result).toEqual([[
        { x: 100, y: 100 },
        { x: 110, y: 100 },
        { x: 110, y: 110 },
        { x: 100, y: 110 },
      ]]);
    });

    it('returns precise points for a triangle', async () => {
      const mockTriangle = {
        type: 'triangle',
        data: { posterId: 'tri-id' },
        width: 100,
        height: 100,
        originX: 'left',
        originY: 'top',
        calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
      } as any;

      mockCanvas.getObjects.mockReturnValue([mockTriangle]);

      const result = await engine.generatePrecisePath('tri-id');

      expect(result).toEqual([[
        { x: 50, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]]);
    });

    it('uses contour tracing for textbox elements', async () => {
      const mockCanvasElement = {
        width: 10,
        height: 10,
        getContext: vi.fn().mockReturnValue({
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8Array(10 * 10 * 4).fill(255), // All opaque
          }),
        }),
      };

      const mockTextbox = {
        type: 'textbox',
        data: { posterId: 'text-id' },
        width: 10,
        height: 10,
        originX: 'left',
        originY: 'top',
        calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
        toCanvasElement: vi.fn().mockReturnValue(mockCanvasElement),
      } as any;

      mockCanvas.getObjects.mockReturnValue([mockTextbox]);

      const result = await engine.generatePrecisePath('text-id');

      // Should return a contour path, not just bounding rect
      expect(mockTextbox.toCanvasElement).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result![0].length).toBeGreaterThan(0);
    });
  });
});
