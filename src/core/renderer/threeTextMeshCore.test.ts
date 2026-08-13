import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  finalizeExtrudedMeshGroup,
  type ThreeTextRendererProps,
  typefaceLikeExtrudeOptions,
} from './threeTextMeshCore';

function extrusionOnlyProps(): Omit<ThreeTextRendererProps, 'onReady'> {
  return {
    content: 'Box',
    fontFamily: 'Arial Black, sans-serif',
    fontSize: 72,
    frontColor: '#ffffff',
    extrusionColor: '#d4af37',
    extrusionOnly: true,
    metalness: 0.9,
    roughness: 0.16,
    bevelSize: 0.12,
    extrusionDepth: 2,
    lightIntensity: 1,
    lightAzimuth: 315,
    lightElevation: 40,
    lightIntensityFromLighting: 1,
    ambientIntensity: 0.4,
    filtersShine: 0.9,
    filtersMetallic: 1,
    edgeRoundness: 0.45,
    shadowOpacity: 0,
    environmentPath: '',
  };
}

describe('extrusion-only mesh', () => {
  it('keeps both caps closed and renders the whole object with one physical material', async () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(2, 0);
    shape.lineTo(2, 1);
    shape.lineTo(0, 1);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelSize: 0.1,
      bevelThickness: 0.1,
      bevelSegments: 4,
    });

    const built = await finalizeExtrudedMeshGroup(geometry, extrusionOnlyProps());
    expect(built).not.toBeNull();
    expect(built!.group.children).toHaveLength(1);

    const mesh = built!.group.children[0] as THREE.Mesh;
    expect(mesh.layers.mask).toBe(2);
    expect((mesh.material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).toBe(true);
    expect((mesh.material as THREE.MeshPhysicalMaterial).color.getHexString()).toBe('d4af37');

    const normal = mesh.geometry.getAttribute('normal');
    let hasFrontCap = false;
    let hasBackCap = false;
    for (let i = 0; i < normal.count; i++) {
      hasFrontCap ||= normal.getZ(i) > 0.99;
      hasBackCap ||= normal.getZ(i) < -0.99;
    }
    expect(hasFrontCap).toBe(true);
    expect(hasBackCap).toBe(true);

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('makes edge width and thickness grow smoothly while keeping segment counts bounded', () => {
    const options = {
      inflate: 0,
      bevelSize: 0.12,
      extrusionDepth: 2,
      bevelThickness: 0.35,
      bevelSegments: 10,
      curveSegments: 16,
    };
    const flat = typefaceLikeExtrudeOptions(0.864, { ...options, edgeRoundness: 0 });
    const low = typefaceLikeExtrudeOptions(0.864, { ...options, edgeRoundness: 0.1 });
    const preset = typefaceLikeExtrudeOptions(0.864, { ...options, edgeRoundness: 0.45 });
    const high = typefaceLikeExtrudeOptions(0.864, { ...options, edgeRoundness: 1 });

    expect(flat.effectiveBevelSize).toBe(0);
    expect(flat.effectiveBT).toBe(0);
    expect(low.effectiveBevelSize).toBeGreaterThan(0);
    expect(low.effectiveBevelSize).toBeLessThan(preset.effectiveBevelSize);
    expect(low.effectiveBT).toBeGreaterThan(0);
    expect(low.effectiveBT).toBeLessThan(preset.effectiveBT);
    expect(high.effectiveBevelSize).toBeGreaterThan(preset.effectiveBevelSize);
    expect(high.effectiveBT).toBeGreaterThanOrEqual(preset.effectiveBT);
    expect(high.effectiveBS).toBeLessThanOrEqual(24);
    expect(high.curveSegments).toBeLessThanOrEqual(24);
  });
});
