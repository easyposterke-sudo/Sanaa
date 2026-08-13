import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export interface FrontTexturePreset {
  id: string;
  label: string;
}

export const FRONT_TEXTURE_PRESETS: FrontTexturePreset[] = [
  { id: 'grain', label: 'Grain' },
  { id: 'rough', label: 'Rough' },
  { id: 'brushed', label: 'Brushed' },
];

export interface LoadedFrontTextures {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

const textureCache = new Map<string, LoadedFrontTextures | null>();
const textureLoader = new THREE.TextureLoader();
const exrLoader = new EXRLoader();

function createProceduralTexture(
  type: 'grain' | 'rough' | 'brushed',
  size: number = 256
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const rng = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor(i / 4 / size);
    let v: number;
    if (type === 'grain') {
      v = rng(x * 7 + y * 13 + 1) * 0.4 + rng(x * 3 + y * 11) * 0.3 + 0.3;
    } else if (type === 'rough') {
      v = rng(x * 5 + y * 7) * 0.5 + rng(x * 17 + y * 19) * 0.3 + 0.2;
    } else {
      const stripe = Math.floor(y / 4) % 2;
      v = stripe * 0.3 + rng(x * 0.1 + y) * 0.4 + 0.3;
    }
    v = Math.max(0, Math.min(1, v));
    const u8 = Math.floor(v * 255);
    data[i] = u8;
    data[i + 1] = u8;
    data[i + 2] = u8;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getTextureImage(tex: THREE.Texture): HTMLCanvasElement | HTMLImageElement | null {
  const img = (tex as unknown as { image?: HTMLCanvasElement | HTMLImageElement }).image;
  return img ?? null;
}

function createRoughnessFromMap(mapTexture: THREE.Texture): THREE.Texture {
  const source = getTextureImage(mapTexture);
  if (!source) return mapTexture.clone();
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createNormalFromMap(mapTexture: THREE.Texture): THREE.Texture {
  const source = getTextureImage(mapTexture);
  if (!source) return mapTexture.clone();
  const w = source.width;
  const h = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i];
    d[i] = 128 + (g - 128);
    d[i + 1] = 128;
    d[i + 2] = 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Load a single texture from URL. Uses EXRLoader for .exr, TextureLoader otherwise. */
function loadTextureFromUrl(
  url: string,
  options?: { useSRGB?: boolean; kind?: 'color' | 'normal' | 'data' }
): Promise<THREE.Texture | null> {
  const useSRGB = options?.useSRGB ?? true;
  const kind = options?.kind ?? (useSRGB ? 'color' : 'data');
  // Cloudinary (and others) may append query params; we only care about the path suffix.
  const urlWithoutQuery = url.split('?')[0].toLowerCase();
  const isExr = urlWithoutQuery.endsWith('.exr');
  const isBlob = url.startsWith('blob:');

  const applyWrap = (tex: THREE.Texture) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in tex) {
      (tex as THREE.Texture).colorSpace = useSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    }
  };

  const normalizeExrNormalIfNeeded = (tex: THREE.Texture) => {
    if (kind !== 'normal') return;
    const img = (tex as unknown as { image?: { data?: ArrayLike<number>; width?: number; height?: number } }).image;
    const data = img?.data as unknown as Float32Array | undefined;
    if (!data || data.length < 4) return;

    // Sample a small grid to estimate range without scanning the full 2K texture.
    const sampleCount = 256;
    let min = Infinity;
    let max = -Infinity;
    const step = Math.max(1, Math.floor((data.length / 4) / sampleCount));
    for (let p = 0; p < sampleCount; p++) {
      const i = (p * step * 4) % data.length;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      min = Math.min(min, r, g, b);
      max = Math.max(max, r, g, b);
    }

    // Many EXR normal maps are stored as signed [-1, 1]. Convert to [0, 1] expected by three.js.
    if (min < -0.01 || max > 1.01) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(1, data[i] * 0.5 + 0.5));
        data[i + 1] = Math.max(0, Math.min(1, data[i + 1] * 0.5 + 0.5));
        data[i + 2] = Math.max(0, Math.min(1, data[i + 2] * 0.5 + 0.5));
      }
      tex.needsUpdate = true;
    }
  };

  const loadTextureViaTextureLoader = () =>
    new Promise<THREE.Texture | null>((resolve) => {
      textureLoader.load(
        url,
        (tex) => {
          applyWrap(tex);
          // JPG/PNG tangent-space normals are usually authored for OpenGL (Y-up); Three’s default flipY breaks many packs.
          if (kind === 'normal') tex.flipY = false;
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });

  // For `blob:` URLs (local file uploads), the URL often doesn't end with `.exr`.
  // Try EXR first; if it fails, fall back to TextureLoader.
  if (isExr || isBlob) {
    return exrLoader
      .loadAsync(url)
      .then((tex) => {
        applyWrap(tex);
        normalizeExrNormalIfNeeded(tex);
        return tex;
      })
      .catch(() => loadTextureViaTextureLoader());
  }

  return loadTextureViaTextureLoader();
}

function loadFromUrl(url: string): Promise<THREE.Texture | null> {
  return loadTextureFromUrl(url, { useSRGB: true, kind: 'color' });
}

export function loadFrontTextures(
  idOrUrl: string
): Promise<LoadedFrontTextures | null> {
  const cacheKey = idOrUrl;
  const cached = textureCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const isUrl = idOrUrl.startsWith('blob:') || idOrUrl.startsWith('http') || idOrUrl.startsWith('/');
  if (isUrl) {
    return loadTextureFromUrl(idOrUrl, { useSRGB: true }).then((map) => {
      if (!map) {
        textureCache.set(cacheKey, null);
        return null;
      }
      const result: LoadedFrontTextures = { map };
      textureCache.set(cacheKey, result);
      return result;
    });
  }

  const presetId = idOrUrl as 'grain' | 'rough' | 'brushed';
  const path = `/textures/${presetId}.png`;
  return loadFromUrl(path).then((loadedMap) => {
    if (loadedMap) {
      const result: LoadedFrontTextures = { map: loadedMap };
      textureCache.set(cacheKey, result);
      return result;
    }
    const map = createProceduralTexture(presetId);
    const result: LoadedFrontTextures = {
      map,
      roughnessMap: createRoughnessFromMap(map),
      normalMap: createNormalFromMap(map),
    };
    textureCache.set(cacheKey, result);
    return result;
  });
}

/** Load a full PBR set: map (diffuse) + optional roughness, normal, metalness. (Displacement omitted — breaks extruded text caps.) */
export function loadFrontTexturesFromSet(
  mapUrl: string,
  roughnessUrl?: string | null,
  normalUrl?: string | null,
  metalnessUrl?: string | null
): Promise<LoadedFrontTextures | null> {
  const cacheKey = [mapUrl, roughnessUrl ?? '', normalUrl ?? '', metalnessUrl ?? ''].join('|');
  const cached = textureCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const mapPromise = loadTextureFromUrl(mapUrl, { useSRGB: true, kind: 'color' });
  const roughnessPromise = roughnessUrl ? loadTextureFromUrl(roughnessUrl, { useSRGB: false, kind: 'data' }) : Promise.resolve(null);
  const normalPromise = normalUrl ? loadTextureFromUrl(normalUrl, { useSRGB: false, kind: 'normal' }) : Promise.resolve(null);
  const metalnessPromise = metalnessUrl ? loadTextureFromUrl(metalnessUrl, { useSRGB: false, kind: 'data' }) : Promise.resolve(null);

  return Promise.all([mapPromise, roughnessPromise, normalPromise, metalnessPromise]).then(
    ([map, roughnessMap, normalMap, metalnessMap]) => {
      if (!map) {
        textureCache.set(cacheKey, null);
        return null;
      }
      const result: LoadedFrontTextures = {
        map,
        ...(roughnessMap && { roughnessMap }),
        ...(normalMap && { normalMap }),
        ...(metalnessMap && { metalnessMap }),
      };
      textureCache.set(cacheKey, result);
      return result;
    }
  );
}

export function blendMapWithIntensity(
  texture: THREE.Texture,
  intensity: number
): THREE.CanvasTexture {
  const src = getTextureImage(texture);
  if (!src) {
    return texture as THREE.CanvasTexture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const t = Math.max(0, Math.min(1, intensity));
  for (let i = 0; i < d.length; i += 4) {
    // Lerp towards neutral gray so the map still modulates base color (instead of washing to white).
    d[i] = Math.round(128 + (d[i] - 128) * t);
    d[i + 1] = Math.round(128 + (d[i + 1] - 128) * t);
    d[i + 2] = Math.round(128 + (d[i + 2] - 128) * t);
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.wrapS = THREE.RepeatWrapping;
  out.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in texture) (out as THREE.Texture).colorSpace = (texture as THREE.Texture).colorSpace ?? THREE.SRGBColorSpace;
  return out;
}

/** Fade roughness map effect: 1 = full map, 0 = uniform (no map variation). Uses green channel like three.js roughnessMap. */
export function blendRoughnessMapWithIntensity(
  texture: THREE.Texture,
  intensity: number
): THREE.Texture {
  const src = getTextureImage(texture);
  if (!src) {
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const t = Math.max(0, Math.min(1, intensity));
  const neutral = 128;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(neutral + (d[i] - neutral) * t);
    d[i + 1] = Math.round(neutral + (d[i + 1] - neutral) * t);
    d[i + 2] = Math.round(neutral + (d[i + 2] - neutral) * t);
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.wrapS = THREE.RepeatWrapping;
  out.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in out) (out as THREE.Texture).colorSpace = THREE.NoColorSpace;
  return out;
}
