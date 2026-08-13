import { describe, expect, it } from 'vitest';
import { ACESFilmicToneMapping, PerspectiveCamera, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import {
  DEFAULT_CAMERA_POSE,
  cameraPosesEqual,
  normalizeCameraPose,
} from './cameraPose';
import {
  applyCameraPose,
  readCameraEvidence,
  readCameraPose,
} from './renderer/cameraPoseThree';

describe('camera pose', () => {
  it('normalizes imported values into bounded, stable JSON', () => {
    expect(
      normalizeCameraPose({
        position: { x: Number.NaN, y: 1.23456789, z: -4 },
        target: { x: 3 },
        fov: 200,
        zoom: 0,
      })
    ).toEqual({
      position: { x: DEFAULT_CAMERA_POSE.position.x, y: 1.234568, z: -4 },
      target: { x: 3, y: 0, z: 0 },
      fov: 179,
      zoom: 0.01,
    });
  });

  it('round-trips a pose through a Three.js perspective camera', () => {
    const camera = new PerspectiveCamera(45, 2, 0.1, 1000);
    const target = new Vector3();
    const pose = normalizeCameraPose({
      position: { x: 4, y: -2, z: 12 },
      target: { x: 1, y: 0.5, z: -1 },
      fov: 52,
      zoom: 1.25,
    });

    applyCameraPose(camera, target, pose);

    expect(cameraPosesEqual(readCameraPose(camera, target), pose)).toBe(true);
  });

  it('captures viewport and renderer settings without a raster payload', () => {
    const camera = new PerspectiveCamera(52, 16 / 9, 0.1, 1000);
    camera.position.set(4, -2, 12);
    camera.zoom = 1.25;
    const target = new Vector3(1, 0.5, -1);
    const renderer = {
      getPixelRatio: () => 2,
      domElement: { width: 1600, height: 900 },
      toneMapping: ACESFilmicToneMapping,
      toneMappingExposure: 1.2,
    } as unknown as WebGLRenderer;

    expect(readCameraEvidence(camera, target, renderer)).toEqual({
      projection: 'perspective',
      position: [4, -2, 12],
      target: [1, 0.5, -1],
      up: [0, 1, 0],
      fov: 52,
      near: 0.1,
      far: 1000,
      zoom: 1.25,
      viewport: { width: 800, height: 450, pixelRatio: 2 },
      toneMapping: 'ACESFilmicToneMapping',
      exposure: 1.2,
    });
  });
});
