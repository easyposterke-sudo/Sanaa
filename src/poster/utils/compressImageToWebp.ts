export interface CompressedWebpImage {
  dataUrl: string;
  file: File;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
}

interface CompressImageOptions {
  maxLongEdge?: number;
  quality?: number;
  maxInputBytes?: number;
}

const SUPPORTED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function compressImageToWebp(
  file: File,
  options: CompressImageOptions = {},
): Promise<CompressedWebpImage> {
  if (!SUPPORTED_INPUT_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }

  const maxInputBytes = options.maxInputBytes ?? 40 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxInputBytes) {
    throw new Error(`Choose an image smaller than ${Math.round(maxInputBytes / (1024 * 1024))} MB.`);
  }

  const maxLongEdge = Math.max(256, Math.round(options.maxLongEdge ?? 4096));
  const quality = Math.min(1, Math.max(0.1, options.quality ?? 0.86));
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = Math.max(1, image.naturalWidth);
    const naturalHeight = Math.max(1, image.naturalHeight);
    const scale = Math.min(1, maxLongEdge / Math.max(naturalWidth, naturalHeight));
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

    const candidate = await canvasToWebpBlob(canvas, quality);
    const keepOriginalWebp = file.type === 'image/webp' && scale === 1 && file.size <= candidate.size;
    const output = keepOriginalWebp ? file : candidate;
    const outputFile = keepOriginalWebp
      ? file
      : new File([output], webpFileName(file.name), {
          type: 'image/webp',
          lastModified: Date.now(),
        });

    return {
      dataUrl: await blobToDataUrl(output),
      file: outputFile,
      width,
      height,
      originalBytes: file.size,
      compressedBytes: output.size,
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

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('This browser could not compress the image to WebP.'));
        return;
      }
      resolve(blob);
    }, 'image/webp', quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The compressed image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function webpFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${base}.webp`;
}
