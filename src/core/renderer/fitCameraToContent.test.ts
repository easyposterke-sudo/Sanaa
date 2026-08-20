import { describe, expect, it } from 'vitest';
import { fitPerspectiveCameraPoseToBounds } from './fitCameraToContent';

const pose = {
  position: { x: 0, y: 0, z: 6 },
  target: { x: 0, y: 0, z: 0 },
  fov: 45,
  zoom: 1,
};

describe('fitPerspectiveCameraPoseToBounds', () => {
  it('moves farther away for a long headline while retaining the viewing direction', () => {
    const short = fitPerspectiveCameraPoseToBounds(
      pose,
      { min: { x: -2, y: -1, z: -0.5 }, max: { x: 2, y: 1, z: 0.5 } },
      2,
    );
    const long = fitPerspectiveCameraPoseToBounds(
      pose,
      { min: { x: -10, y: -1, z: -0.5 }, max: { x: 10, y: 1, z: 0.5 } },
      2,
    );

    expect(long.position.z).toBeGreaterThan(short.position.z);
    expect(long.position.x).toBe(0);
    expect(long.position.y).toBe(0);
  });

  it('recentres off-centre content without changing fov or zoom', () => {
    const fitted = fitPerspectiveCameraPoseToBounds(
      pose,
      { min: { x: 2, y: 4, z: 0 }, max: { x: 6, y: 8, z: 2 } },
      1,
    );

    expect(fitted.target).toEqual({ x: 4, y: 6, z: 1 });
    expect(fitted.position.x).toBe(4);
    expect(fitted.position.y).toBe(6);
    expect(fitted.fov).toBe(45);
    expect(fitted.zoom).toBe(1);
  });
});
