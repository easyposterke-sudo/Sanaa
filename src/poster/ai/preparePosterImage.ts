export interface PreparedPosterImage {
  dataUrl: string;
  width: number;
  height: number;
  fileName: string;
}

export async function prepareReferencePoster(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1024, quality: 0.78 });
}

export async function preparePortrait(file: File): Promise<PreparedPosterImage> {
  return resizePosterImage(file, { maxLongEdge: 1600, quality: 0.88 });
}

async function resizePosterImage(
  file: File,
  options: { maxLongEdge: number; quality: number },
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
    const blob = await canvasToBlob(canvas, 'image/webp', options.quality);
    return {
      dataUrl: await blobToDataUrl(blob),
      width,
      height,
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
