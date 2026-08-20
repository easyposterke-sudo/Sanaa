import type { CameraPose } from '../types';

export interface Bounds3D {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * Return a camera pose that contains the supplied world-space bounds.
 * The current viewing direction is retained, so fitting never changes the
 * chosen 3D angle; it only recentres the target and changes the distance.
 */
export function fitPerspectiveCameraPoseToBounds(
  pose: CameraPose,
  bounds: Bounds3D,
  aspect: number,
  margin = 1.18,
): CameraPose {
  const width = Math.max(0.001, bounds.max.x - bounds.min.x);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const depth = Math.max(0.001, bounds.max.z - bounds.min.z);
  const target = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };

  const safeAspect = Math.max(0.01, aspect);
  const zoom = Math.max(0.01, pose.zoom);
  const fovRadians = (Math.max(1, Math.min(179, pose.fov)) * Math.PI) / 180;
  const effectiveVerticalFov = 2 * Math.atan(Math.tan(fovRadians / 2) / zoom);
  const tangent = Math.max(0.0001, Math.tan(effectiveVerticalFov / 2));
  const fitHeightDistance = height / (2 * tangent);
  const fitWidthDistance = width / (2 * tangent * safeAspect);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * Math.max(1, margin) + depth / 2;

  let direction = {
    x: pose.position.x - pose.target.x,
    y: pose.position.y - pose.target.y,
    z: pose.position.z - pose.target.z,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 0.0001) direction = { x: 0, y: 0, z: 1 };
  else {
    direction = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
  }

  return {
    ...pose,
    target,
    position: {
      x: target.x + direction.x * distance,
      y: target.y + direction.y * distance,
      z: target.z + direction.z * distance,
    },
  };
}
