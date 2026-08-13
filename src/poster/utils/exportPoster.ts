import type { CanvasBackground } from '../types';
import { canvasBackgroundToCanvas2D, isSolidBackground } from '../types';

export const MAX_EXPORT_PIXELS = 32_000_000;
export const MAX_EXPORT_DIMENSION = 16_384;

export type ExportProgress = 'preparing' | 'rendering' | 'encoding' | 'downloading';

export type PosterExportPlan = {
  width: number;
  height: number;
  pixels: number;
  rawMemoryMiB: number;
  safe: boolean;
  reason?: string;
};

type FabricExportCanvas = {
  toCanvasElement: (multiplier?: number) => HTMLCanvasElement;
};

export function getPosterExportPlan(
  canvasWidth: number,
  canvasHeight: number,
  scale: number
): PosterExportPlan {
  const width = Math.round(canvasWidth * scale);
  const height = Math.round(canvasHeight * scale);
  const pixels = width * height;
  const rawMemoryMiB = (pixels * 4) / (1024 * 1024);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return {
      width,
      height,
      pixels,
      rawMemoryMiB,
      safe: false,
      reason: 'The poster dimensions are invalid.',
    };
  }

  if (width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION) {
    return {
      width,
      height,
      pixels,
      rawMemoryMiB,
      safe: false,
      reason: `This export exceeds the safe browser dimension of ${MAX_EXPORT_DIMENSION.toLocaleString()} px.`,
    };
  }

  if (pixels > MAX_EXPORT_PIXELS) {
    return {
      width,
      height,
      pixels,
      rawMemoryMiB,
      safe: false,
      reason: `This export needs ${Math.round(rawMemoryMiB)} MiB for each pixel buffer and may freeze the browser. Choose a lower scale.`,
    };
  }

  return { width, height, pixels, rawMemoryMiB, safe: true };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode the poster as PNG.'));
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function allowPaint(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function exportPosterPng(options: {
  fabricCanvas: FabricExportCanvas;
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: CanvasBackground;
  scale: number;
  filename?: string;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<void> {
  const {
    fabricCanvas,
    canvasWidth,
    canvasHeight,
    canvasBackground,
    scale,
    filename = `poster-${Date.now()}-${scale}x.png`,
    onProgress,
  } = options;
  const plan = getPosterExportPlan(canvasWidth, canvasHeight, scale);
  if (!plan.safe) throw new Error(plan.reason || 'This export is too large for the browser.');

  onProgress?.('preparing');
  await allowPaint();
  onProgress?.('rendering');

  let rendered: HTMLCanvasElement | null = null;
  let composite: HTMLCanvasElement | null = null;
  try {
    rendered = fabricCanvas.toCanvasElement(scale);
    let output = rendered;

    if (!isSolidBackground(canvasBackground)) {
      composite = document.createElement('canvas');
      composite.width = plan.width;
      composite.height = plan.height;
      const context = composite.getContext('2d');
      if (!context) throw new Error('The browser could not create an export canvas.');
      canvasBackgroundToCanvas2D(
        context,
        canvasBackground,
        plan.width,
        plan.height
      );
      context.drawImage(rendered, 0, 0);
      output = composite;
    }

    onProgress?.('encoding');
    await allowPaint();
    const blob = await canvasToPngBlob(output);
    onProgress?.('downloading');
    downloadBlob(blob, filename);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error(
        'Export was blocked by an image loaded without cross-origin permission. Re-upload that image and try again.'
      );
    }
    throw error;
  } finally {
    if (composite) {
      composite.width = 1;
      composite.height = 1;
    }
    if (rendered) {
      rendered.width = 1;
      rendered.height = 1;
    }
  }
}
