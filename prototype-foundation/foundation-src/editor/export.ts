import { downloadBlob } from './files';

const MAX_BROWSER_PIXELS = 32_000_000;
const MAX_BROWSER_DIMENSION = 16_384;

export type ExportPlan = {
  width: number;
  height: number;
  pixels: number;
  allowed: boolean;
  reason?: string;
};

export function planBrowserExport(
  width: number,
  height: number,
  scale: number,
): ExportPlan {
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  const pixels = outputWidth * outputHeight;
  if (
    !Number.isFinite(outputWidth) ||
    !Number.isFinite(outputHeight) ||
    outputWidth <= 0 ||
    outputHeight <= 0
  ) {
    return { width: outputWidth, height: outputHeight, pixels, allowed: false, reason: 'Invalid export dimensions.' };
  }
  if (outputWidth > MAX_BROWSER_DIMENSION || outputHeight > MAX_BROWSER_DIMENSION) {
    return {
      width: outputWidth,
      height: outputHeight,
      pixels,
      allowed: false,
      reason: 'This export is too large for a reliable browser canvas. Use the cloud renderer.',
    };
  }
  if (pixels > MAX_BROWSER_PIXELS) {
    return {
      width: outputWidth,
      height: outputHeight,
      pixels,
      allowed: false,
      reason: 'This export could freeze or exhaust browser memory. Use the cloud renderer.',
    };
  }
  return { width: outputWidth, height: outputHeight, pixels, allowed: true };
}
export function serializePosterSvg(svg: SVGSVGElement): Blob {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelectorAll('.selection-outline,.resize-handle').forEach((node) => node.remove());
  const source = new XMLSerializer().serializeToString(clone);
  return new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
}

export function exportPosterSvg(svg: SVGSVGElement, fileName: string): void {
  downloadBlob(serializePosterSvg(svg), fileName);
}

export async function exportPosterPng(
  svg: SVGSVGElement,
  options: {
    width: number;
    height: number;
    scale: number;
    fileName: string;
  },
): Promise<void> {
  const plan = planBrowserExport(options.width, options.height, options.scale);
  if (!plan.allowed) throw new Error(plan.reason);

  const svgBlob = serializePosterSvg(svg);
  const bitmap = await createImageBitmap(svgBlob, {
    resizeWidth: plan.width,
    resizeHeight: plan.height,
    resizeQuality: 'high',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create an export canvas.');
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
        'image/png',
      );
    });
    downloadBlob(blob, options.fileName);
    canvas.width = 1;
    canvas.height = 1;
  } finally {
    bitmap.close();
  }
}
