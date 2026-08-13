import type { Canvas } from 'fabric';
import { FabricImage } from 'fabric';
import { getFabricCanvasRef } from '../canvasRef';
import type { Poster3DTextElement, PosterImageElement, PosterProject } from '../types';
import { usePosterStore } from '../store/posterStore';

type FabricImageLike = {
  type?: string;
  isType?: (...types: string[]) => boolean;
  toDataURL: (opts?: object) => string;
  data?: { posterId?: string; imageSrc?: string };
};

function forEachFabricSceneObject(canvas: Canvas, fn: (obj: unknown) => void): void {
  const walk = (obj: unknown) => {
    fn(obj);
    const o = obj as { getObjects?: () => unknown[]; _objects?: unknown[] };
    const kids =
      typeof o.getObjects === 'function'
        ? o.getObjects()
        : Array.isArray(o._objects)
          ? o._objects
          : [];
    for (const c of kids) walk(c);
  };
  for (const top of canvas.getObjects()) walk(top);
}

function isFabricImageObject(obj: unknown): obj is FabricImageLike {
  if (!obj || typeof obj !== 'object') return false;
  if (obj instanceof FabricImage) return true;
  const o = obj as FabricImageLike;
  if (typeof o.isType === 'function') {
    try {
      if (o.isType('Image')) return true;
    } catch { /* ignore */ }
  }
  return o.type === 'Image';
}

function dataUrlFromDrawableSource(el: HTMLImageElement | HTMLCanvasElement): string | null {
  try {
    const w = el instanceof HTMLImageElement ? el.naturalWidth || el.width : el.width;
    const h = el instanceof HTMLImageElement ? el.naturalHeight || el.height : el.height;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0);
    const url = c.toDataURL('image/webp', 0.85);
    return url.startsWith('data:') ? url : null;
  } catch {
    return null;
  }
}

function dataUrlFromFabricImageInternals(obj: object): string | null {
  const anyObj = obj as {
    _cacheCanvas?: HTMLCanvasElement;
    _filteredEl?: HTMLCanvasElement;
    _originalElement?: HTMLImageElement | HTMLCanvasElement;
    _element?: HTMLImageElement | HTMLCanvasElement;
  };
  for (const el of [anyObj._cacheCanvas, anyObj._filteredEl, anyObj._originalElement, anyObj._element]) {
    if (el instanceof HTMLCanvasElement || el instanceof HTMLImageElement) {
      const u = dataUrlFromDrawableSource(el);
      if (u) return u;
    }
  }
  return null;
}

function dataUrlFromObjectToCanvasElement(obj: object): string | null {
  const o = obj as { toCanvasElement?: (opts?: object) => HTMLCanvasElement };
  if (typeof o.toCanvasElement !== 'function') return null;
  try {
    const cel = o.toCanvasElement({ multiplier: 1 });
    if (!(cel instanceof HTMLCanvasElement)) return null;
    const url = cel.toDataURL('image/webp', 0.85);
    return url.startsWith('data:') ? url : null;
  } catch {
    return null;
  }
}

function dataUrlFromCanvasLayerExport(canvas: Canvas, target: FabricImageLike): string | null {
  try {
    const withBounds = target as FabricImageLike & {
      getBoundingRect?: () => { left: number; top: number; width: number; height: number };
    };
    const br =
      typeof withBounds.getBoundingRect === 'function' ? withBounds.getBoundingRect() : null;
    const opts: {
      format: 'webp' | 'png';
      quality?: number;
      multiplier: number;
      filter: (o: unknown) => boolean;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    } = {
      format: 'webp',
      quality: 0.85,
      multiplier: 1,
      filter: (o: unknown) => o === target,
    };
    if (br && Number.isFinite(br.width) && Number.isFinite(br.height) && br.width > 0 && br.height > 0) {
      opts.left = br.left;
      opts.top = br.top;
      opts.width = br.width;
      opts.height = br.height;
    }
    const url = canvas.toDataURL(opts);
    if (typeof url === 'string' && url.startsWith('data:')) return url;
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract the image as a data URL from the live Fabric canvas for a given poster element.
 * Tries multiple strategies: object.toDataURL, internal element rasterize,
 * object.toCanvasElement, and canvas.toDataURL with a per-object filter.
 */
function extractDataUrlFromFabricCanvas(posterId: string, blobUrl: string): string | null {
  const canvas = getFabricCanvasRef();
  if (!canvas) return null;

  try { canvas.requestRenderAll(); } catch { /* ignore */ }

  const objs: unknown[] = [];
  forEachFabricSceneObject(canvas, (o) => objs.push(o));

  const match =
    objs.find((o) => (o as FabricImageLike).data?.posterId === posterId && isFabricImageObject(o)) ??
    objs.find(
      (o) =>
        isFabricImageObject(o) &&
        typeof (o as FabricImageLike).data?.imageSrc === 'string' &&
        (o as FabricImageLike).data?.imageSrc === blobUrl
    );

  if (!match || !isFabricImageObject(match)) return null;

  // Strategy 1: Fabric object toDataURL
  try {
    const url = match.toDataURL({ format: 'webp', quality: 0.85, multiplier: 1 });
    if (typeof url === 'string' && url.startsWith('data:') && url.length > 100) return url;
  } catch { /* try next */ }

  // Strategy 2: read raw internal HTMLImageElement / HTMLCanvasElement
  const fromInternals = dataUrlFromFabricImageInternals(match);
  if (fromInternals && fromInternals.length > 100) return fromInternals;

  // Strategy 3: object.toCanvasElement → canvas.toDataURL
  const fromObjCanvas = dataUrlFromObjectToCanvasElement(match);
  if (fromObjCanvas && fromObjCanvas.length > 100) return fromObjCanvas;

  // Strategy 4: re-render only this object through the poster canvas
  return dataUrlFromCanvasLayerExport(canvas, match);
}

function explainFabricFailure(posterId: string): string {
  const canvas = getFabricCanvasRef();
  if (!canvas) {
    return 'Poster canvas is not ready. Stay on the poster editor tab and try again.';
  }
  const objs: unknown[] = [];
  forEachFabricSceneObject(canvas, (o) => objs.push(o));
  const found = objs.some(
    (o) => (o as FabricImageLike).data?.posterId === posterId && isFabricImageObject(o)
  );
  if (!found) {
    return 'The image layer is not on the canvas (removed or failed to load). Re-add the image from the sidebar.';
  }
  return 'Could not read image pixels from the canvas. Delete this image layer, re-add it from the sidebar, then try again.';
}

/**
 * For blob URLs: go straight to the Fabric canvas (the pixels are already decoded and visible).
 * Never attempt fetch(blob:) — it fails after HMR/reload and spams the console.
 */
function resolveBlobToDataUrl(blobUrl: string, posterId: string): string {
  const dataUrl = extractDataUrlFromFabricCanvas(posterId, blobUrl);
  if (dataUrl) return dataUrl;
  throw new Error(explainFabricFailure(posterId));
}

/**
 * Convert a blob URL to data URL by loading in an Image. Use when the blob is not
 * displayed on the canvas (e.g. originalSrc for re-editing masked images).
 */
function convertBlobToDataUrlViaImage(blobUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 1;
        c.height = img.naturalHeight || img.height || 1;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('Could not get 2D context'));
        ctx.drawImage(img, 0, 0);
        const url = c.toDataURL('image/webp', 0.85);
        resolve(url.startsWith('data:') ? url : '');
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Could not load image from blob. Try re-editing the mask or re-adding the image.'));
    img.src = blobUrl;
  });
}

/**
 * Replace `blob:` image references with `data:` URLs so they can be POSTed and uploaded to Cloudinary.
 * Does not mutate the original project.
 */
export async function resolveBlobUrlsInProject(project: PosterProject): Promise<PosterProject> {
  const clone = JSON.parse(JSON.stringify(project)) as PosterProject;
  for (const el of clone.elements) {
    if (el.type === 'image') {
      const img = el as PosterImageElement;
      if (typeof img.src === 'string' && img.src.startsWith('blob:')) {
        try {
          img.src = resolveBlobToDataUrl(img.src, el.id);
        } catch (e) {
          throw new Error(
            `Failed to convert an image layer. ${e instanceof Error ? e.message : 'Re-add the image or use a hosted URL.'}`
          );
        }
      }
      if (typeof img.originalSrc === 'string' && img.originalSrc.startsWith('blob:')) {
        try {
          img.originalSrc = await convertBlobToDataUrlViaImage(img.originalSrc);
        } catch (e) {
          throw new Error(
            `Failed to convert masked image original. ${e instanceof Error ? e.message : 'Re-edit the mask or re-add the image.'}`
          );
        }
      }
    }
    if (el.type === '3d-text' && typeof el.image === 'string' && el.image.startsWith('blob:')) {
      try {
        el.image = resolveBlobToDataUrl(el.image, el.id);
      } catch (e) {
        throw new Error(
          `Failed to convert a 3D text layer image. ${e instanceof Error ? e.message : 'Try re-exporting or re-adding it.'}`
        );
      }
    }
  }
  return clone;
}

/**
 * After resolving blobs for publish, persist `data:` URLs into the live Zustand store so the editor
 * does not keep dead blob references.
 */
export function applyResolvedBlobUrlsToPosterStore(resolved: PosterProject): void {
  const byId = new Map(resolved.elements.map((e) => [e.id, e]));
  const { elements, updateElement } = usePosterStore.getState();

  for (const el of elements) {
    const r = byId.get(el.id);
    if (!r || r.type !== el.type) continue;

    if (el.type === 'image' && r.type === 'image') {
      const cur = el as PosterImageElement;
      const next = r as PosterImageElement;
      const patch: Partial<PosterImageElement> = {};
      if (
        typeof cur.src === 'string' &&
        cur.src.startsWith('blob:') &&
        typeof next.src === 'string' &&
        next.src.startsWith('data:')
      ) {
        patch.src = next.src;
      }
      if (
        typeof cur.originalSrc === 'string' &&
        cur.originalSrc.startsWith('blob:') &&
        typeof next.originalSrc === 'string' &&
        next.originalSrc.startsWith('data:')
      ) {
        patch.originalSrc = next.originalSrc;
      }
      if (Object.keys(patch).length > 0) updateElement(el.id, patch);
    }

    if (el.type === '3d-text' && r.type === '3d-text') {
      const cur = el as Poster3DTextElement;
      const next = r as Poster3DTextElement;
      if (
        typeof cur.image === 'string' &&
        cur.image.startsWith('blob:') &&
        typeof next.image === 'string' &&
        next.image.startsWith('data:')
      ) {
        updateElement(el.id, { image: next.image });
      }
    }
  }
}

/**
 * Apply Cloudinary URLs from a processed project to the store.
 * Replaces blob/data URLs with https URLs so we don't re-upload on next save.
 */
export function applyProcessedProjectUrlsToStore(processed: PosterProject): void {
  const byId = new Map(processed.elements.map((e) => [e.id, e]));
  const { elements, updateElement } = usePosterStore.getState();
  const isLocalUrl = (s: string) => s.startsWith('blob:') || s.startsWith('data:');
  const isHttpsUrl = (s: string) => s.startsWith('https://');

  for (const el of elements) {
    const r = byId.get(el.id);
    if (!r || r.type !== el.type) continue;

    if (el.type === 'image' && r.type === 'image') {
      const cur = el as PosterImageElement;
      const next = r as PosterImageElement;
      const patch: Partial<PosterImageElement> = {};
      if (
        typeof cur.src === 'string' &&
        isLocalUrl(cur.src) &&
        typeof next.src === 'string' &&
        isHttpsUrl(next.src)
      ) {
        patch.src = next.src;
      }
      if (
        typeof cur.originalSrc === 'string' &&
        isLocalUrl(cur.originalSrc) &&
        typeof next.originalSrc === 'string' &&
        isHttpsUrl(next.originalSrc)
      ) {
        patch.originalSrc = next.originalSrc;
      }
      if (Object.keys(patch).length > 0) updateElement(el.id, patch);
    }

    if (el.type === '3d-text' && r.type === '3d-text') {
      const cur = el as Poster3DTextElement;
      const next = r as Poster3DTextElement;
      if (
        typeof cur.image === 'string' &&
        isLocalUrl(cur.image) &&
        typeof next.image === 'string' &&
        isHttpsUrl(next.image)
      ) {
        updateElement(el.id, { image: next.image });
      }
    }
  }
}
