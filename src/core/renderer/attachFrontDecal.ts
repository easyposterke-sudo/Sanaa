/**
 * Independent front decal: a flat plane slightly above the front cap bbox, with its own
 * diffuse + optional normal. Does not wrap bevels (best for flat shape layers).
 */
import * as THREE from 'three';
import { loadFrontTexturesFromSet } from '../textures/frontTextureCache';

export const FRONT_DECAL_ROLE = 'frontDecal' as const;

/** Width / height of XY plane; width = scale * minBbox, height = width / texAspect */
export function decalPlaneDimensions(
  minBboxSide: number,
  scale: number,
  texAspect: number
): { width: number; height: number } {
  const s = Math.max(0.02, Math.min(2, scale));
  const w = minBboxSide * s;
  const a = texAspect > 1e-6 ? texAspect : 1;
  return { width: w, height: w / a };
}

/** World position on front plane: center + offset * half-extent in XY, fixed z. */
export function decalPlanePosition(
  center: THREE.Vector3,
  size: THREE.Vector3,
  offsetX: number,
  offsetY: number,
  z: number
): THREE.Vector3 {
  const ox = THREE.MathUtils.clamp(offsetX, -2, 2);
  const oy = THREE.MathUtils.clamp(offsetY, -2, 2);
  return new THREE.Vector3(center.x + ox * 0.5 * size.x, center.y + oy * 0.5 * size.y, z);
}

export function removeFrontDecalFromGroup(group: THREE.Group): void {
  const toRemove: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData?.meshRole === FRONT_DECAL_ROLE) toRemove.push(o);
  });
  for (const o of toRemove) {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.MeshPhysicalMaterial | undefined;
    if (mat) {
      mat.map?.dispose();
      mat.normalMap?.dispose();
      mat.dispose();
    }
    o.parent?.remove(o);
  }
}

export type FrontDecalFields = {
  frontDecalEnabled?: boolean;
  frontDecalDiffuseUrl?: string | null;
  frontDecalNormalUrl?: string | null;
  frontDecalOffsetX?: number;
  frontDecalOffsetY?: number;
  frontDecalScale?: number;
  frontDecalRotationDeg?: number;
  frontDecalNormalStrength?: number;
  /** Negate tangent-space normal (flip bump lighting). */
  frontDecalNormalInvert?: boolean;
  /** Replace diffuse chroma with tint color × alpha (keeps silhouette; normal map unchanged). */
  frontDecalTintEnabled?: boolean;
  /** Hex color when tint is enabled (default white). */
  frontDecalTintColor?: string;
};

/** Parse `#rgb` / `#rrggbb` (or bare `rrggbb`) for tint; invalid input → white. */
export function parseFrontDecalTintRgb(hex: string | undefined): { r: number; g: number; b: number } {
  let h = (hex ?? '#ffffff').trim();
  if (/^[0-9a-f]{6}$/i.test(h)) h = `#${h}`;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
  if (!m) return { r: 255, g: 255, b: 255 };
  let s = m[1];
  if (s.length === 3) {
    s = s
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Solid tint × alpha: drops baked-in diffuse color while keeping transparency edges (normal map unchanged).
 */
export function createTintedDecalDiffuseTexture(
  source: THREE.Texture,
  tintHex: string | undefined
): THREE.CanvasTexture {
  const { r: tr, g: tg, b: tb } = parseFrontDecalTintRgb(tintHex);
  const img = source.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const w = img && 'width' in img ? img.width : 0;
  const h = img && 'height' in img ? img.height : 0;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx || !w || !h || !img) {
    const empty = new THREE.CanvasTexture(canvas);
    empty.flipY = source.flipY;
    if ('colorSpace' in empty) (empty as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
    return empty;
  }

  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i] = Math.round((tr * a) / 255);
    d[i + 1] = Math.round((tg * a) / 255);
    d[i + 2] = Math.round((tb * a) / 255);
  }
  ctx.putImageData(id, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = source.flipY;
  out.wrapS = source.wrapS;
  out.wrapT = source.wrapT;
  if ('colorSpace' in out) (out as THREE.Texture).colorSpace = source.colorSpace ?? THREE.SRGBColorSpace;
  out.needsUpdate = true;
  return out;
}

/**
 * Resize normal texels to match diffuse width/height so UV0–1 maps the same pixel grid (fixes
 * visible shift when maps differ in resolution or when one was re-exported).
 */
export function resizeNormalTextureToMatchDiffuse(
  diffuse: THREE.Texture,
  normalMap: THREE.Texture
): THREE.Texture {
  const dImg = diffuse.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const nImg = normalMap.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const dw = dImg && 'width' in dImg ? dImg.width : 0;
  const dh = dImg && 'height' in dImg ? dImg.height : 0;
  const nw = nImg && 'width' in nImg ? nImg.width : 0;
  const nh = nImg && 'height' in nImg ? nImg.height : 0;
  if (!dw || !dh || !nw || !nh || (dw === nw && dh === nh)) {
    return normalMap;
  }

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return normalMap;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(nImg as CanvasImageSource, 0, 0, nw, nh, 0, 0, dw, dh);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = false;
  out.wrapS = THREE.ClampToEdgeWrapping;
  out.wrapT = THREE.ClampToEdgeWrapping;
  if ('colorSpace' in out) (out as THREE.Texture).colorSpace = THREE.NoColorSpace;
  normalMap.dispose();
  return out;
}

/** Decals use clamped UVs; keep map and normal transforms identical for pixel alignment. */
function applyDecalTexturePairSettings(map: THREE.Texture, normalMap: THREE.Texture | undefined): void {
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.center.set(0.5, 0.5);
  if (normalMap) {
    normalMap.wrapS = THREE.ClampToEdgeWrapping;
    normalMap.wrapT = THREE.ClampToEdgeWrapping;
    normalMap.center.copy(map.center);
    normalMap.offset.copy(map.offset);
    normalMap.repeat.copy(map.repeat);
    normalMap.rotation = map.rotation;
    // Diffuse (TextureLoader) defaults to flipY=true; normals are loaded with flipY=false for pack
    // conventions — mismatch inverts V so bumps look upside-down vs the diffuse.
    normalMap.flipY = map.flipY;
    normalMap.needsUpdate = true;
  }
}

export async function attachFrontDecalToGroup(
  group: THREE.Group,
  props: FrontDecalFields,
  opts?: { signal?: AbortSignal }
): Promise<void> {
  removeFrontDecalFromGroup(group);
  const signal = opts?.signal;
  if (signal?.aborted) return;
  if (!props.frontDecalEnabled || !props.frontDecalDiffuseUrl) return;

  const frontMesh = group.children[0] as THREE.Mesh | undefined;
  if (!frontMesh?.geometry) return;

  const geo = frontMesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const loaded = await loadFrontTexturesFromSet(
    props.frontDecalDiffuseUrl,
    undefined,
    props.frontDecalNormalUrl ?? undefined,
    undefined
  );
  if (signal?.aborted) return;
  if (!loaded?.map) return;

  let diffuseMap: THREE.Texture = loaded.map;
  if (props.frontDecalTintEnabled) {
    diffuseMap = createTintedDecalDiffuseTexture(loaded.map, props.frontDecalTintColor);
  }

  let normalMap = loaded.normalMap;
  if (normalMap) {
    normalMap = resizeNormalTextureToMatchDiffuse(diffuseMap, normalMap);
  }
  applyDecalTexturePairSettings(diffuseMap, normalMap);

  const img = diffuseMap.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const texW = img && 'width' in img ? img.width : 1;
  const texH = img && 'height' in img ? img.height : 1;
  const texAspect = texH > 0 ? texW / texH : 1;

  const scale = props.frontDecalScale ?? 0.35;
  const minSide = Math.max(1e-6, Math.min(size.x, size.y));
  const { width, height } = decalPlaneDimensions(minSide, scale, texAspect);

  const geom = new THREE.PlaneGeometry(width, height);
  const offsetX = props.frontDecalOffsetX ?? 0;
  const offsetY = props.frontDecalOffsetY ?? 0;
  const zEps = 0.002 * Math.max(size.z, 0.01);
  const posLocal = decalPlanePosition(center, size, offsetX, offsetY, box.max.z + zEps);
  posLocal.applyMatrix4(frontMesh.matrix);

  const nStr = Math.max(0, Math.min(10, props.frontDecalNormalStrength ?? 1));
  const nSign = props.frontDecalNormalInvert ? -1 : 1;
  const normalScale = new THREE.Vector2(nStr * nSign, nStr * nSign);

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: diffuseMap,
    metalness: 0,
    roughness: 0.45,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    ...(normalMap
      ? {
          normalMap,
          normalMapType: THREE.TangentSpaceNormalMap,
          normalScale,
        }
      : {}),
  });

  const decalMesh = new THREE.Mesh(geom, mat);
  decalMesh.position.copy(posLocal);
  decalMesh.quaternion.copy(frontMesh.quaternion);
  decalMesh.rotateZ(THREE.MathUtils.degToRad(props.frontDecalRotationDeg ?? 0));
  decalMesh.renderOrder = 1;
  decalMesh.userData.meshRole = FRONT_DECAL_ROLE;
  decalMesh.castShadow = false;
  decalMesh.receiveShadow = true;
  group.add(decalMesh);
}
