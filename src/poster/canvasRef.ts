import type { Canvas } from 'fabric';
import { canvasBackgroundToCanvas2D } from './types';
import type { CanvasBackground } from './types';
import { withFabricExportExclusions } from './utils/exportPoster';

let fabricCanvasRef: Canvas | null = null;

export function setFabricCanvasRef(canvas: Canvas | null) {
  fabricCanvasRef = canvas;
}

export function getFabricCanvasRef(): Canvas | null {
  return fabricCanvasRef;
}

const THUMB_MAX_W = 400;

/**
 * Capture a small PNG data URL of the current poster canvas for use as a template thumbnail.
 * Composites the gradient background (which Fabric doesn't render) with the Fabric layer.
 */
export async function capturePosterThumbnail(
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: CanvasBackground,
): Promise<string | null> {
  const fabricCanvas = getFabricCanvasRef();
  if (!fabricCanvas) return null;

  const scale = Math.min(1, THUMB_MAX_W / canvasWidth);
  const w = Math.round(canvasWidth * scale);
  const h = Math.round(canvasHeight * scale);

  fabricCanvas.discardActiveObject();
  fabricCanvas.requestRenderAll();

  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  let fabricDataUrl: string;
  try {
    fabricDataUrl = withFabricExportExclusions(fabricCanvas, () =>
      fabricCanvas.toDataURL({
        format: 'webp',
        multiplier: scale,
        quality: 0.8,
      }),
    );
  } catch {
    // Tainted canvas (e.g. cross-origin images without CORS) cannot be exported
    return null;
  }

  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const ctx = temp.getContext('2d');
  if (!ctx) return fabricDataUrl;

  canvasBackgroundToCanvas2D(ctx, canvasBackground, w, h);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      resolve();
    };
    img.onerror = reject;
    img.src = fabricDataUrl;
  });

  return temp.toDataURL('image/webp', 0.8);
}
