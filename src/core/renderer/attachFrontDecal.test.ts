import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  decalPlaneDimensions,
  decalPlanePosition,
  resizeNormalTextureToMatchDiffuse,
  parseFrontDecalTintRgb,
} from './attachFrontDecal';

describe('attachFrontDecal helpers', () => {
  it('decalPlaneDimensions uses min side and aspect', () => {
    const { width, height } = decalPlaneDimensions(10, 0.35, 2);
    expect(width).toBeCloseTo(3.5);
    expect(height).toBeCloseTo(1.75);
  });

  it('decalPlanePosition applies half-extent offsets', () => {
    const c = new THREE.Vector3(0, 0, 0);
    const s = new THREE.Vector3(4, 6, 1);
    const p = decalPlanePosition(c, s, 1, -1, 0.5);
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(-3);
    expect(p.z).toBe(0.5);
  });

  it('resizeNormalTextureToMatchDiffuse returns same instance when sizes match', () => {
    const dCanvas = document.createElement('canvas');
    dCanvas.width = 64;
    dCanvas.height = 64;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = 64;
    nCanvas.height = 64;
    const diffuse = new THREE.CanvasTexture(dCanvas);
    const normalMap = new THREE.CanvasTexture(nCanvas);
    const out = resizeNormalTextureToMatchDiffuse(diffuse, normalMap);
    expect(out).toBe(normalMap);
  });

  it('parseFrontDecalTintRgb parses 6- and 3-digit hex', () => {
    expect(parseFrontDecalTintRgb('#aabbcc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseFrontDecalTintRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseFrontDecalTintRgb('aabbcc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseFrontDecalTintRgb('#gggggg')).toEqual({ r: 255, g: 255, b: 255 });
  });
});
