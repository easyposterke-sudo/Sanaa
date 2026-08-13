/**
 * 3D mesh → SVG paths pipeline.
 * Extracts silhouette edges from the mesh (as seen by the camera), projects to 2D,
 * chains into closed contours, and returns vector SVG.
 */
import * as THREE from 'three';

const R = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function projectToSVG(
  worldPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): { x: number; y: number } {
  const ndc = worldPos.clone().project(camera);
  return {
    x: R(((ndc.x + 1) * 0.5) * width),
    y: R(((1 - ndc.y) * 0.5) * height),
  };
}

export function meshToSVGPaths(
  mesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): string {
  if (width <= 0 || height <= 0) {
    width = 800;
    height = 400;
  }
  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();

  const positionAttr = geometry.getAttribute('position');
  const indexAttr = geometry.index;
  const pos = new THREE.Vector3();
  const meshMatrix = mesh.matrixWorld;
  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);
  const readIndex = (i: number): number => {
    if (!indexAttr) return i;
    const attr = indexAttr as unknown as { array?: ArrayLike<number>; getX?: (i: number) => number };
    if (attr.array && i < attr.array.length) return Number(attr.array[i]);
    if (typeof attr.getX === 'function') return attr.getX(i);
    return i;
  };

  const getWorldPos = (i: number) => {
    pos.fromBufferAttribute(positionAttr, i);
    return pos.clone().applyMatrix4(meshMatrix);
  };

  const numTris = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(positionAttr.count / 3);
  const frontFacing: boolean[] = [];
  const triangles: [number, number, number][] = [];

  const getIndex = readIndex;

  for (let t = 0; t < numTris; t++) {
    let i0: number, i1: number, i2: number;
    if (indexAttr) {
      i0 = getIndex(t * 3);
      i1 = getIndex(t * 3 + 1);
      i2 = getIndex(t * 3 + 2);
    } else {
      i0 = t * 3;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }
    triangles.push([i0, i1, i2]);
    const p0 = getWorldPos(i0);
    const p1 = getWorldPos(i1);
    const p2 = getWorldPos(i2);
    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(p1, p0),
        new THREE.Vector3().subVectors(p2, p0)
      )
      .normalize();
    const center = new THREE.Vector3().addVectors(p0, p1).add(p2).multiplyScalar(1 / 3);
    const viewDir = new THREE.Vector3().subVectors(cameraPos, center).normalize();
    const dot = normal.dot(viewDir);
    frontFacing.push(dot < 0);
  }

  const edgeToFaces = new Map<string, number[]>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

  triangles.forEach(([i0, i1, i2], t) => {
    const push = (a: number, b: number) => {
      const k = edgeKey(a, b);
      if (!edgeToFaces.has(k)) edgeToFaces.set(k, []);
      edgeToFaces.get(k)!.push(t);
    };
    push(i0, i1);
    push(i1, i2);
    push(i2, i0);
  });

  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let edgesWithTwoFaces = 0;
  let oppositeFacingCount = 0;

  edgeToFaces.forEach((faces, k) => {
    if (faces.length !== 2) return;
    edgesWithTwoFaces++;
    const [f0, f1] = faces;
    if (frontFacing[f0] === frontFacing[f1]) return;
    oppositeFacingCount++;
    const [a, b] = k.split(',').map(Number);
    const pA = projectToSVG(getWorldPos(a), camera, width, height);
    const pB = projectToSVG(getWorldPos(b), camera, width, height);
    segments.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
  });

  const key = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const segsWithIndex = segments.map((s, i) => ({ seg: s, i }));
  const byPoint = new Map<string, { seg: typeof segments[0]; i: number }[]>();
  segsWithIndex.forEach(({ seg, i }) => {
    const k1 = key(seg.x1, seg.y1);
    const k2 = key(seg.x2, seg.y2);
    if (!byPoint.has(k1)) byPoint.set(k1, []);
    byPoint.get(k1)!.push({ seg, i });
    if (!byPoint.has(k2)) byPoint.set(k2, []);
    byPoint.get(k2)!.push({ seg, i });
  });

  const used = new Set<number>();
  const contours: { x: number; y: number }[][] = [];

  function getOtherEnd(seg: typeof segments[0], fromX: number, fromY: number) {
    if (Math.abs(seg.x1 - fromX) < 0.01 && Math.abs(seg.y1 - fromY) < 0.01)
      return { x: seg.x2, y: seg.y2 };
    return { x: seg.x1, y: seg.y1 };
  }

  const roundP = (x: number, y: number) => ({ x: R(x), y: R(y) });

  segsWithIndex.forEach(({ seg, i }) => {
    if (used.has(i)) return;
    const path: { x: number; y: number }[] = [];
    let cur = roundP(seg.x1, seg.y1);
    const startKey = key(cur.x, cur.y);
    path.push(cur);
    cur = roundP(seg.x2, seg.y2);
    path.push(cur);
    used.add(i);

    for (let iter = 0; iter < segments.length + 1; iter++) {
      const curKey = key(cur.x, cur.y);
      if (curKey === startKey && path.length > 2) {
        contours.push(path);
        return;
      }
      const candidates = byPoint.get(curKey) || [];
      let nextChoice: { seg: (typeof segments)[0]; i: number } | null = null;
      for (const c of candidates) {
        if (!used.has(c.i)) {
          nextChoice = c;
          break;
        }
      }
      if (!nextChoice) break;
      const other = getOtherEnd(nextChoice.seg, cur.x, cur.y);
      cur = roundP(other.x, other.y);
      path.push(cur);
      used.add(nextChoice.i);
    }
    if (path.length >= 2) contours.push(path);
  });

  const frontCount = frontFacing.filter(Boolean).length;
  console.log('[meshToSVGPaths]', {
    numTris,
    totalEdges: edgeToFaces.size,
    edgesWithTwoFaces,
    oppositeFacingCount,
    frontFacingCount: frontCount,
    segments: segments.length,
    contours: contours.length,
  });

  let pathEls = contours
    .filter((c) => c.length >= 2)
    .map((c) => {
      const start = c[0];
      const rest = c.slice(1);
      return `<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')} Z" fill="currentColor" stroke="none"/>`;
    });

  if (pathEls.length === 0 && segments.length > 0) {
    pathEls = segments.map(
      (s) => `<path d="M ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} L ${s.x2.toFixed(2)} ${s.y2.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1"/>`
    );
  }

  const paths = pathEls.join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${paths}
</svg>`;
}
