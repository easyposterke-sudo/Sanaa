import { describe, expect, it } from 'vitest';
import {
  appendCornerAnchor,
  appendSmoothAnchor,
  distanceToCubicSegment,
  getSignedArea,
  hitTestPathSegments,
  insertPathAnchorOnSegment,
  pathPointsToPathD,
  pathPointsToSvgPathElement,
  pathSegmentCount,
  removePathAnchorAt,
  resolveSegmentControls,
  reversePath,
} from './penToolMath';

describe('getSignedArea', () => {
  it('calculates positive area for clockwise rectangle', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // In SVG Y-down, (0,0)->(100,0)->(100,100)->(0,100) is CW.
    // Shoelace: (100-0)*(0+0) + (100-100)*(100+0) + (0-100)*(100+100) + (0-0)*(0+100)
    // = 0 + 0 + (-100)*200 + 0 = -20000
    // My getSignedArea returns -area, so -(-20000) = 20000
    expect(getSignedArea(pts)).toBeGreaterThan(0);
  });

  it('calculates negative area for counter-clockwise rectangle', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ];
    expect(getSignedArea(pts)).toBeLessThan(0);
  });
});

describe('reversePath', () => {
  it('reverses points and swaps handles', () => {
    const pts = [
      { x: 0, y: 0, outX: 10, outY: 0 },
      { x: 100, y: 100, inX: 90, inY: 100 },
    ];
    const rev = reversePath(pts);
    expect(rev[0].x).toBe(100);
    expect(rev[0].outX).toBe(90);
    expect(rev[1].x).toBe(0);
    expect(rev[1].inX).toBe(10);
  });
});

describe('pathPointsToPathD', () => {
  it('emits L for straight segments and rounds coordinates', () => {
    const pts = [
      { x: 0.1111, y: 0.2222 },
      { x: 100.3333, y: 0.4444 },
    ];
    const d = pathPointsToPathD(pts, false);
    expect(d).toBe('M 0.111 0.222 L 100.333 0.444');
  });

  it('forces main path clockwise', () => {
    // CCW triangle: (0,0) -> (0,100) -> (100,100)
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    const d = pathPointsToPathD(pts, true);
    // Should be reversed to CW: (100,100) -> (0,100) -> (0,0) -> Z
    // OR (0,0) -> (100,100) -> (0,100) -> Z (which is the same path)
    // Wait, let's check what reversePath actually does: it reverses the array.
    // Original: 0:(0,0), 1:(0,100), 2:(100,100)
    // Reversed: 0:(100,100), 1:(0,100), 2:(0,0)
    expect(d).toBe('M 100 100 L 0 100 L 0 0 Z');
  });

  it('forces islands counter-clockwise', () => {
    // CW Main
    const main = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // CW Island (should be reversed)
    const islandCW = [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 40 },
      { x: 20, y: 40 },
    ];
    const d = pathPointsToPathD(main, true, [islandCW]);
    expect(d).toContain('M 0 0 L 100 0 L 100 100 L 0 100 Z');
    // islandCW reversed: (20,40) -> (40,40) -> (40,20) -> (20,20)
    expect(d).toContain('M 20 40 L 40 40 L 40 20 L 20 20 Z');
  });

  it('uses explicit out/in handles in C command', () => {
    const pts = [
      { x: 0, y: 0, outX: 50, outY: 0 },
      { x: 100, y: 100, inX: 50, inY: 100 },
    ];
    const d = pathPointsToPathD(pts, false);
    expect(d).toBe('M 0 0 C 50 0, 50 100, 100 100');
  });

  it('closes islands even if main path is open', () => {
    const main = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    // CCW island: (10,10) -> (10,20) -> (20,10)
    const island = [{ x: 10, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 10 }];
    const d = pathPointsToPathD(main, false, [island]);
    expect(d).toContain('M 0 0 L 100 100');
    expect(d).toContain('M 10 10 L 10 20 L 20 10 Z');
  });
});

describe('resolveSegmentControls', () => {
  it('falls back to anchors when handles missing', () => {
    const [b0, b1, b2, b3] = resolveSegmentControls(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    expect(b0).toEqual({ x: 0, y: 0 });
    expect(b1).toEqual({ x: 0, y: 0 });
    expect(b2).toEqual({ x: 10, y: 10 });
    expect(b3).toEqual({ x: 10, y: 10 });
  });
});

describe('distanceToCubicSegment', () => {
  it('returns ~0 for point on straight cubic', () => {
    const b0 = { x: 0, y: 0 };
    const b1 = { x: 0, y: 0 };
    const b2 = { x: 10, y: 0 };
    const b3 = { x: 10, y: 0 };
    const { dist, t } = distanceToCubicSegment(b0, b1, b2, b3, { x: 5, y: 0 });
    expect(dist).toBeLessThan(0.1);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
  });
});

describe('hitTestPathSegments', () => {
  it('hits horizontal segment', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const hit = hitTestPathSegments(pts, false, { x: 50, y: 1 }, 5);
    expect(hit).not.toBeNull();
    expect(hit!.segmentIndex).toBe(0);
  });

  it('returns null when too far', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const hit = hitTestPathSegments(pts, false, { x: 50, y: 30 }, 5);
    expect(hit).toBeNull();
  });
});

describe('pathSegmentCount', () => {
  it('counts wrap for closed', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(pathSegmentCount(pts, true)).toBe(3);
    expect(pathSegmentCount(pts, false)).toBe(2);
  });
});

describe('insertPathAnchorOnSegment', () => {
  it('splits open path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const { points: next, insertedIndex } = insertPathAnchorOnSegment(pts, false, 0, 0.5);
    expect(next.length).toBe(3);
    expect(insertedIndex).toBe(1);
    expect(pathPointsToPathD(next, false)).toContain('C');
  });

  it('splits closing segment on closed path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const segLast = 2;
    const { points: next, insertedIndex } = insertPathAnchorOnSegment(pts, true, segLast, 0.5);
    expect(next.length).toBe(4);
    expect(insertedIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('removePathAnchorAt', () => {
  it('refuses to shrink open path below 2', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(removePathAnchorAt(pts, 0, false)).toBe(pts);
  });

  it('removes middle of open path', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const next = removePathAnchorAt(pts, 1, false);
    expect(next.length).toBe(2);
  });
});

describe('appendCornerAnchor / appendSmoothAnchor', () => {
  it('appendCornerAnchor adds bare point', () => {
    const n = appendCornerAnchor([{ x: 0, y: 0 }], 10, 20);
    expect(n[1]).toEqual({ x: 10, y: 20 });
  });

  it('appendSmoothAnchor adds symmetric handles', () => {
    const n = appendSmoothAnchor([], { x: 10, y: 10 }, { x: 20, y: 30 });
    expect(n[0]!.outX).toBeDefined();
    expect(n[0]!.inX).toBeDefined();
    expect(n[0]!.x).toBe(10);
  });
});

describe('pathPointsToSvgPathElement', () => {
  it('includes islands, fill-rule, and fill-opacity', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const islands = [[{ x: 20, y: 20 }, { x: 20, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 20 }]];
    const svg = pathPointsToSvgPathElement(pts, true, {
      fill: '#ff0000',
      islands,
      fillRule: 'evenodd',
      fillOpacity: 0.5,
    });

    expect(svg).toContain('M 0 0 L 100 0 L 100 100 L 0 100 Z');
    expect(svg).toContain('M 20 20 L 20 40 L 40 40 L 40 20 Z');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('Z');
  });

  it('defaults to evenodd if islands present but no fillRule specified', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const islands = [[{ x: 20, y: 20 }, { x: 20, y: 40 }, { x: 40, y: 40 }]];
    const svg = pathPointsToSvgPathElement(pts, true, { islands });
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('omits fill-opacity if 1 or null', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const svg1 = pathPointsToSvgPathElement(pts, false, { fillOpacity: 1 });
    expect(svg1).not.toContain('fill-opacity');

    const svgNull = pathPointsToSvgPathElement(pts, false, { fillOpacity: undefined });
    expect(svgNull).not.toContain('fill-opacity');
  });
});
