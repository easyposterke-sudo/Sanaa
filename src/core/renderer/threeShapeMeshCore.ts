import * as THREE from 'three';
import type { ShapeLayerKind, ShapeLayerSpec } from '../types';
import { DEFAULT_RING_HOLE_RATIO } from '../types';
import {
  applyExtrusionShearToGeometry,
  finalizeExtrudedMeshGroup,
  typefaceLikeExtrudeOptions,
  type ThreeTextMeshLoadedTextures,
  type ThreeTextRendererProps,
} from './threeTextMeshCore';
import { svgPathToShapes } from './svgPathToThree';

/** Centered rounded rectangle (Y-up); `radius` clamped so corners never cross. */
function appendRoundedRectContour(shape: THREE.Shape, w: number, h: number, radius: number): void {
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const y1 = h / 2;
  const rMax = Math.min(w, h) / 2 - 1e-5;
  const r = Math.min(Math.max(0, radius), rMax);
  if (r < 1e-6) {
    shape.moveTo(x0, y0);
    shape.lineTo(x1, y0);
    shape.lineTo(x1, y1);
    shape.lineTo(x0, y1);
    shape.closePath();
    return;
  }
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - r);
  shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x0 + r, y1);
  shape.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + r);
  shape.absarc(x0 + r, y0 + r, r, Math.PI, (3 * Math.PI) / 2, false);
  shape.closePath();
}

/**
 * Rounded rectangle traced clockwise (for `Shape.holes` opposite the CCW outer from
 * {@link appendRoundedRectContour}).
 */
function appendRoundedRectHoleCW(path: THREE.Path, w: number, h: number, radius: number): void {
  const x0 = -w / 2;
  const y0 = -h / 2;
  const x1 = w / 2;
  const y1 = h / 2;
  const rMax = Math.min(w, h) / 2 - 1e-5;
  const r = Math.min(Math.max(0, radius), rMax);
  if (r < 1e-6) {
    path.moveTo(x0, y0);
    path.lineTo(x0, y1);
    path.lineTo(x1, y1);
    path.lineTo(x1, y0);
    path.closePath();
    return;
  }
  path.moveTo(x0 + r, y0);
  path.absarc(x0 + r, y0 + r, r, (3 * Math.PI) / 2, Math.PI, true);
  path.lineTo(x0, y1 - r);
  path.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true);
  path.lineTo(x1 - r, y1);
  path.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true);
  path.lineTo(x1, y0 + r);
  path.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true);
  path.lineTo(x0 + r, y0);
  path.closePath();
}

function clampShapeHoleRatio(spec: ShapeLayerSpec): number {
  const raw = spec.ringHoleRatio ?? DEFAULT_RING_HOLE_RATIO;
  return Math.max(0.06, Math.min(0.92, raw));
}

/**
 * Single closed contour (no `holes`): disk(O,R) \\ disk((d,0), r) — two arcs between intersections.
 * `EllipseCurve` always sweeps the shorter angle span unless `aClockwise` flips it; CCW on the inner
 * circle from lower tip → upper tip follows the +X “belly”, which is the boundary of O∩I (a lens).
 * We need the inner arc through θ=π (toward the origin): two clockwise pieces angInL→π and π→angInU.
 * A hole Path that sticks outside the outer circle breaks `ExtrudeGeometry` triangulation (diagonal artifacts).
 */
function appendCrescentContour(shape: THREE.Shape, R: number, r: number, d: number): boolean {
  if (d <= 1e-6) return false;
  const gap = Math.abs(R - r);
  const sum = R + r;
  if (d <= gap + 1e-5 || d >= sum - 1e-5) return false;
  const ix = (R * R - r * r + d * d) / (2 * d);
  const ySq = R * R - ix * ix;
  if (ySq <= 1e-10) return false;
  const iy = Math.sqrt(ySq);
  const angOutU = Math.atan2(iy, ix);
  const angOutL = Math.atan2(-iy, ix);
  const angInL = Math.atan2(-iy, ix - d);
  const angInU = Math.atan2(iy, ix - d);
  shape.moveTo(ix, iy);
  // Long outer limb of O (through −X): split so each EllipseCurve sweep stays ≤ π.
  shape.absarc(0, 0, R, angOutU, Math.PI, false);
  shape.absarc(0, 0, R, Math.PI, 2 * Math.PI + angOutL, false);
  shape.lineTo(ix, -iy);
  // Concave edge: arc of inner circle inside O passes through θ=π at (d−r,0), not through +X.
  shape.absarc(d, 0, r, angInL, Math.PI, true);
  shape.absarc(d, 0, r, Math.PI, angInU, true);
  shape.closePath();
  return true;
}

function buildShape2D(spec: ShapeLayerSpec): THREE.Shape {
  const w = Math.max(0.05, spec.width);
  const h = Math.max(0.05, spec.height);
  const shape = new THREE.Shape();
  switch (spec.kind) {
    case 'rect': {
      const x0 = -w / 2;
      const y0 = -h / 2;
      shape.moveTo(x0, y0);
      shape.lineTo(x0 + w, y0);
      shape.lineTo(x0 + w, y0 + h);
      shape.lineTo(x0, y0 + h);
      shape.closePath();
      break;
    }
    case 'roundedRect': {
      const cornerR = Math.min(w, h) * 0.14;
      appendRoundedRectContour(shape, w, h, cornerR);
      break;
    }
    case 'hollowRect': {
      const hr = clampShapeHoleRatio(spec);
      const x0 = -w / 2;
      const y0 = -h / 2;
      shape.moveTo(x0, y0);
      shape.lineTo(x0 + w, y0);
      shape.lineTo(x0 + w, y0 + h);
      shape.lineTo(x0, y0 + h);
      shape.closePath();
      const iw = w * hr;
      const ih = h * hr;
      const hole = new THREE.Path();
      hole.moveTo(-iw / 2, -ih / 2);
      hole.lineTo(-iw / 2, ih / 2);
      hole.lineTo(iw / 2, ih / 2);
      hole.lineTo(iw / 2, -ih / 2);
      hole.closePath();
      shape.holes.push(hole);
      break;
    }
    case 'hollowRoundedRect': {
      const hr = clampShapeHoleRatio(spec);
      const outerCornerR = Math.min(w, h) * 0.14;
      appendRoundedRectContour(shape, w, h, outerCornerR);
      const iw = w * hr;
      const ih = h * hr;
      const innerCornerR = Math.min(outerCornerR * hr, Math.min(iw, ih) / 2 - 1e-4);
      const hole = new THREE.Path();
      if (innerCornerR < 1e-4) {
        hole.moveTo(-iw / 2, -ih / 2);
        hole.lineTo(-iw / 2, ih / 2);
        hole.lineTo(iw / 2, ih / 2);
        hole.lineTo(iw / 2, -ih / 2);
        hole.closePath();
      } else {
        appendRoundedRectHoleCW(hole, iw, ih, innerCornerR);
      }
      shape.holes.push(hole);
      break;
    }
    case 'circle': {
      const r = Math.min(w, h) / 2;
      shape.absarc(0, 0, r, 0, Math.PI * 2, false);
      break;
    }
    case 'ring': {
      /** Annulus: outer disk with concentric circular hole (hole fully inside — safe for `ExtrudeGeometry`). */
      const R = (Math.min(w, h) / 2) * 0.92;
      const holeRatio = clampShapeHoleRatio(spec);
      const rHole = R * holeRatio;
      shape.absarc(0, 0, R, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      break;
    }
    case 'ellipse': {
      shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
      break;
    }
    case 'triangle': {
      shape.moveTo(-w / 2, -h / 3);
      shape.lineTo(w / 2, -h / 3);
      shape.lineTo(0, (2 * h) / 3);
      shape.closePath();
      break;
    }
    case 'crescent': {
      /**
       * Thin lunar crescent: two circular arcs (intersection tips), one closed contour — not a hole Path
       * (offset inner circle extends past the outer rim and confuses triangulation).
       */
      const R = Math.min(w, h) * 0.46;
      const r = R * 0.86;
      const d = R * 0.5;
      if (!appendCrescentContour(shape, R, r, d)) {
        shape.absarc(0, 0, R * 0.9, 0, Math.PI * 2, false);
      }
      break;
    }
    case 'star': {
      /** Regular 5-point star fitted to the layer width × height box. */
      const n = 5;
      const RoX = (w / 2) * 0.92;
      const RoY = (h / 2) * 0.92;
      const RiX = RoX * 0.38;
      const RiY = RoY * 0.38;
      const step = Math.PI / n;
      for (let i = 0; i < 2 * n; i++) {
        const angle = i * step - Math.PI / 2;
        const rx = i % 2 === 0 ? RoX : RiX;
        const ry = i % 2 === 0 ? RoY : RiY;
        const x = Math.cos(angle) * rx;
        const y = Math.sin(angle) * ry;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      break;
    }
    case 'svgPath': {
      // Handled in buildThreeShapeMeshGroup before buildShape2D
      const x0 = -w / 2;
      const y0 = -h / 2;
      shape.moveTo(x0, y0);
      shape.lineTo(x0 + w, y0);
      shape.lineTo(x0 + w, y0 + h);
      shape.lineTo(x0, y0 + h);
      shape.closePath();
      break;
    }
    default: {
      const x0 = -w / 2;
      const y0 = -h / 2;
      shape.moveTo(x0, y0);
      shape.lineTo(x0 + w, y0);
      shape.lineTo(x0 + w, y0 + h);
      shape.lineTo(x0, y0 + h);
      shape.closePath();
    }
  }
  return shape;
}

function reCenterGeometryXY(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const c = new THREE.Vector3();
  box.getCenter(c);
  geometry.translate(-c.x, -c.y, 0);
}

/** Centered extruded shape mesh (same material path as `buildThreeTextMeshGroup`). */
export async function buildThreeShapeMeshGroup(
  props: Omit<ThreeTextRendererProps, 'onReady'>,
  spec: ShapeLayerSpec,
  opts?: { signal?: AbortSignal }
): Promise<{ group: THREE.Group; loadedTextures: ThreeTextMeshLoadedTextures | null } | null> {
  const w = Math.max(0.1, spec.width);
  const h = Math.max(0.1, spec.height);
  const sizeRef = Math.max(w, h);
  const {
    inflate,
    bevelSize,
    edgeRoundness,
    extrusionDepth,
    bevelThickness,
    bevelSegments,
    curveSegments,
    extrusionAngle = 0,
  } = props;

  const ext = typefaceLikeExtrudeOptions(sizeRef, {
    inflate,
    bevelSize,
    edgeRoundness,
    extrusionDepth,
    bevelThickness,
    bevelSegments,
    curveSegments,
  });

  /** Circle/ellipse use one `EllipseCurve`; low `curveSegments` facets the rim and extrusion wall. */
  const curveSegmentsForExtrude =
    spec.kind === 'circle' ||
    spec.kind === 'ring' ||
    spec.kind === 'ellipse' ||
    spec.kind === 'crescent' ||
    spec.kind === 'roundedRect' ||
    spec.kind === 'hollowRect' ||
    spec.kind === 'hollowRoundedRect'
      ? Math.min(
          192,
          Math.max(ext.curveSegments, 72, Math.round(36 + sizeRef * 20))
        )
      : ext.curveSegments;

  const isCrescent = spec.kind === 'crescent';
  const isSvg = spec.kind === 'svgPath';

  if (isSvg) {
    if (!spec.svgPathD || !spec.svgPathD.trim()) return null;
    const shapes = svgPathToShapes(spec.svgPathD, w, h);
    if (shapes.length === 0) return null;

    const bevelSizeWorld = ext.effectiveBevelSize;
    const bevelOn = bevelSizeWorld > 1e-8;
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: ext.depth,
      curveSegments: ext.curveSegments,
      bevelEnabled: bevelOn,
      bevelThickness: bevelOn ? ext.effectiveBT : 0,
      bevelSize: bevelSizeWorld,
      bevelSegments: bevelOn ? ext.effectiveBS : 1,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    applyExtrusionShearToGeometry(geometry, extrusionAngle);
    return finalizeExtrudedMeshGroup(geometry, props, opts);
  }

  const shape2d = buildShape2D(spec);
  /** Large bevels round the horn tips; crescents use a fraction to stay closer to a sharp 2D icon. */
  const bevelMul = isCrescent ? 0.34 : 1;
  const bevelSegs = isCrescent ? Math.max(3, Math.round(ext.effectiveBS * 0.55)) : ext.effectiveBS;

  const bevelSizeWorld = ext.effectiveBevelSize * bevelMul;
  const bevelOn = bevelSizeWorld > 1e-8;
  const geometry = new THREE.ExtrudeGeometry(shape2d, {
    depth: ext.depth,
    curveSegments: curveSegmentsForExtrude,
    bevelEnabled: bevelOn,
    bevelThickness: bevelOn ? ext.effectiveBT * bevelMul : 0,
    bevelSize: bevelSizeWorld,
    bevelSegments: bevelOn ? bevelSegs : 1,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  if (isCrescent) {
    geometry.rotateZ(THREE.MathUtils.degToRad(34));
    reCenterGeometryXY(geometry);
  }

  applyExtrusionShearToGeometry(geometry, extrusionAngle);
  return finalizeExtrudedMeshGroup(geometry, props, opts);
}
