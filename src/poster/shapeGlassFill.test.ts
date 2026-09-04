import { describe, expect, it } from 'vitest';
import { Rect } from 'fabric';
import { setFabricObjectGlassFill } from './glassShapeFabric';
import { normalizePosterShapeFill } from './shapeFillFabric';
import { lineStrokeFromFill } from './posterShapeGeometry';

describe('poster vector glass fills', () => {
  it('preserves valid glass settings for saved shapes and paths', () => {
    expect(
      normalizePosterShapeFill({ type: 'glass', color: '#dbeafe', blur: 18 }, '#3b82f6'),
    ).toEqual({ type: 'glass', color: '#dbeafe', blur: 18 });
  });

  it('repairs invalid tint and blur values without breaking old documents', () => {
    expect(
      normalizePosterShapeFill(
        { type: 'glass', color: 'not-a-color', blur: Number.POSITIVE_INFINITY },
        '#14b8a6',
      ),
    ).toEqual({ type: 'glass', color: '#14b8a6', blur: 12 });

    expect(
      normalizePosterShapeFill({ type: 'glass', color: '#ffffff', blur: 100 }, '#14b8a6'),
    ).toEqual({ type: 'glass', color: '#ffffff', blur: 40 });
  });

  it('uses the glass tint when a legacy line receives a glass fill', () => {
    expect(lineStrokeFromFill({ type: 'glass', color: '#abcdef', blur: 10 }, '#000000')).toBe(
      '#abcdef',
    );
  });

  it('disables Fabric object caching while a shape uses backdrop glass', () => {
    const shape = new Rect({ width: 120, height: 80, objectCaching: true });

    setFabricObjectGlassFill(shape, { type: 'glass', color: '#ffffff', blur: 18 });
    expect(shape.objectCaching).toBe(false);

    setFabricObjectGlassFill(shape, undefined);
    expect(shape.objectCaching).toBe(true);
  });
});
