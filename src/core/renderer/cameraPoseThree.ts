import * as THREE from 'three';
import { normalizeCameraPose } from '../cameraPose';
import type { CameraPose, WebGLCameraEvidence } from '../types';

export function readCameraPose(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3
): CameraPose {
  return normalizeCameraPose({
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    target: { x: target.x, y: target.y, z: target.z },
    fov: camera.fov,
    zoom: camera.zoom,
  });
}

export function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  value: CameraPose | undefined
): CameraPose {
  const pose = normalizeCameraPose(value);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  target.set(pose.target.x, pose.target.y, pose.target.z);
  camera.fov = pose.fov;
  camera.zoom = pose.zoom;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  return pose;
}

function toneMappingName(value: THREE.ToneMapping): string {
  if (value === THREE.NoToneMapping) return 'NoToneMapping';
  if (value === THREE.LinearToneMapping) return 'LinearToneMapping';
  if (value === THREE.ReinhardToneMapping) return 'ReinhardToneMapping';
  if (value === THREE.CineonToneMapping) return 'CineonToneMapping';
  if (value === THREE.ACESFilmicToneMapping) return 'ACESFilmicToneMapping';
  if (value === THREE.AgXToneMapping) return 'AgXToneMapping';
  if (value === THREE.NeutralToneMapping) return 'NeutralToneMapping';
  return `ToneMapping(${value})`;
}

export function readCameraEvidence(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  renderer: THREE.WebGLRenderer
): WebGLCameraEvidence {
  const pose = readCameraPose(camera, target);
  const pixelRatio = renderer.getPixelRatio();
  const width = Math.max(1, Math.round(renderer.domElement.width / pixelRatio));
  const height = Math.max(1, Math.round(renderer.domElement.height / pixelRatio));
  return {
    projection: 'perspective',
    position: [pose.position.x, pose.position.y, pose.position.z],
    target: [pose.target.x, pose.target.y, pose.target.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
    fov: pose.fov,
    near: camera.near,
    far: camera.far,
    zoom: pose.zoom,
    viewport: { width, height, pixelRatio },
    toneMapping: toneMappingName(renderer.toneMapping),
    exposure: renderer.toneMappingExposure,
  };
}
