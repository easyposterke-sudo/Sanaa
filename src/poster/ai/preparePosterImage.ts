export interface PreparedPosterImage {
  /** Original reference pixels kept in memory for crops, never sent as the overview. */
  originalDataUrl?: string;
  /** Small analysis copy; never used as the editable image replacement. */
  analysisDataUrl?: string;
  dataUrl: string;
  width: number;
  height: number;
  /** Original decoded file dimensions before the AI working copy is resized. */
  sourceWidth: number;
  sourceHeight: number;
  fileName: string;
}

export async function prepareCreationAsset(file: File): Promise<PreparedPosterImage> {
  const image = await prepareTemplateReference(file);
  const preview = await resizePosterImage(file, { maxLongEdge: 768, quality: 0.72 });
  return { ...image, analysisDataUrl: preview.dataUrl };
}

export async function prepareReferencePoster(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1024, quality: 0.78 });
}

/** Higher-detail working copy used both for AI reconstruction and as the editable tracing guide. */
export async function prepareTemplateReference(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1536, quality: 0.84 });
}

/** Reference-only preparation; portrait/background upload behavior is unchanged. */
export async function prepareReconstructionReference(file: File): Promise<PreparedPosterImage> {
  const prepared = await prepareTemplateReference(file);
  return { ...prepared, originalDataUrl: await blobToDataUrl(file) };
}

export async function prepareReferenceDetailCrops(reference: PreparedPosterImage): Promise<Array<{
  box: { x: number; y: number; width: number; height: number }; dataUrl: string;
}>> {
  const image = await loadImage(reference.originalDataUrl ?? reference.dataUrl);
  const regions = [{ x: 0, y: 0 }, { x: 0.45, y: 0 }, { x: 0, y: 0.45 }, { x: 0.45, y: 0.45 }];
  return regions.map(position => {
    const box = { ...position, width: 0.55, height: 0.55 };
    const sw = image.naturalWidth * box.width; const sh = image.naturalHeight * box.height;
    const scale = Math.min(1, 960 / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare reference details.');
    context.drawImage(image, box.x * image.naturalWidth, box.y * image.naturalHeight, sw, sh, 0, 0, canvas.width, canvas.height);
    return { box, dataUrl: canvas.toDataURL('image/webp', 0.88) };
  });
}

export async function preparePortrait(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1600, quality: 0.88 });
}

/** Keep logo edges and transparency intact while bounding the project size. */
export async function prepareLogoImage(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1536, quality: 1, format: 'image/png' });
}

async function resizePosterImage(
  file: File,
  options: { maxLongEdge: number; quality: number; format?: 'image/png' },
): Promise<PreparedPosterImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 35 * 1024 * 1024) throw new Error('Images must be 35 MB or smaller.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = Math.max(1, image.naturalWidth);
    const naturalHeight = Math.max(1, image.naturalHeight);
    const scale = Math.min(1, options.maxLongEdge / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('This browser could not prepare the image.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, options.format ?? 'image/webp', options.quality);
    return {
      dataUrl: await blobToDataUrl(blob),
      width,
      height,
      sourceWidth: naturalWidth,
      sourceHeight: naturalHeight,
      fileName: file.name,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be compressed.'))),
      type,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}
