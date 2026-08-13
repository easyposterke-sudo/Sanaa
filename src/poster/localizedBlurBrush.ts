export type BlurBrushPoint = {
  x: number;
  y: number;
};

export type FabricTransform = [
  number,
  number,
  number,
  number,
  number,
  number,
];

export type LocalizedBlurStroke = {
  points: BlurBrushPoint[];
  radiusX: number;
  radiusY: number;
  strength: number;
};

export const MAX_LOCAL_BLUR_RADIUS = 96;

export function scenePointToImagePixel(
  point: BlurBrushPoint,
  matrix: FabricTransform,
  imageWidth: number,
  imageHeight: number
): BlurBrushPoint | null {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-8) return null;
  const sceneX = point.x - e;
  const sceneY = point.y - f;
  return {
    x: (d * sceneX - c * sceneY) / determinant + imageWidth / 2,
    y: (-b * sceneX + a * sceneY) / determinant + imageHeight / 2,
  };
}

export function brushRadiiInImagePixels(
  matrix: FabricTransform,
  brushDiameter: number
): { radiusX: number; radiusY: number } {
  const scaleX = Math.max(1e-6, Math.hypot(matrix[0], matrix[1]));
  const scaleY = Math.max(1e-6, Math.hypot(matrix[2], matrix[3]));
  const sceneRadius = Math.max(1, brushDiameter) / 2;
  return {
    radiusX: sceneRadius / scaleX,
    radiusY: sceneRadius / scaleY,
  };
}

export function pointTouchesImage(
  point: BlurBrushPoint,
  width: number,
  height: number,
  radiusX = 0,
  radiusY = 0
): boolean {
  return (
    point.x >= -radiusX &&
    point.y >= -radiusY &&
    point.x <= width + radiusX &&
    point.y <= height + radiusY
  );
}

export function getLocalizedBlurRadius(
  width: number,
  height: number,
  strength: number
): number {
  if (width <= 0 || height <= 0 || strength <= 0) return 0;
  const normalized = Math.max(0, Math.min(100, strength)) / 100;
  return Math.min(
    MAX_LOCAL_BLUR_RADIUS,
    Math.max(1, normalized * Math.min(width, height) * 0.025)
  );
}

function loadBrushImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be loaded for blur painting.'));
    image.src = src;
  });
}

function drawEllipticalStroke(
  context: CanvasRenderingContext2D,
  stroke: LocalizedBlurStroke
): void {
  const first = stroke.points[0];
  if (!first) return;
  const radiusX = Math.max(0.5, stroke.radiusX);
  const radiusY = Math.max(0.5, stroke.radiusY);

  if (stroke.points.length === 1) {
    context.beginPath();
    context.ellipse(first.x, first.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    return;
  }

  const yScale = radiusY / radiusX;
  context.save();
  context.scale(1, yScale);
  context.beginPath();
  context.moveTo(first.x, first.y / yScale);
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    context.lineTo(point.x, point.y / yScale);
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = radiusX * 2;
  context.stroke();
  context.restore();
}

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          try {
            resolve(canvas.toDataURL('image/png'));
          } catch {
            reject(new Error('The blurred image could not be encoded.'));
          }
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The blurred image could not be encoded.'));
        reader.readAsDataURL(blob);
      },
      'image/webp',
      0.94
    );
  });
}

/**
 * Bake one feathered blur stroke into an image. The returned raster keeps the
 * source dimensions so the Fabric transform and mask layout remain unchanged.
 */
export async function bakeLocalizedBlurStroke(
  src: string,
  stroke: LocalizedBlurStroke
): Promise<string> {
  if (stroke.points.length === 0) return src;
  const image = await loadBrushImage(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) {
    throw new Error('The selected image has invalid dimensions.');
  }

  const output = document.createElement('canvas');
  const blurred = document.createElement('canvas');
  const mask = document.createElement('canvas');
  const featheredMask = document.createElement('canvas');
  for (const canvas of [output, blurred, mask, featheredMask]) {
    canvas.width = width;
    canvas.height = height;
  }

  const outputContext = output.getContext('2d');
  const blurContext = blurred.getContext('2d');
  const maskContext = mask.getContext('2d');
  const featherContext = featheredMask.getContext('2d');
  if (!outputContext || !blurContext || !maskContext || !featherContext) {
    throw new Error('The browser could not create the blur brush canvas.');
  }
  if (typeof blurContext.filter !== 'string') {
    throw new Error('This browser does not support the localized blur brush.');
  }

  outputContext.drawImage(image, 0, 0, width, height);

  const blurRadius = getLocalizedBlurRadius(width, height, stroke.strength);
  blurContext.filter = `blur(${blurRadius.toFixed(2)}px)`;
  blurContext.drawImage(image, 0, 0, width, height);
  blurContext.filter = 'none';

  maskContext.fillStyle = '#ffffff';
  maskContext.strokeStyle = '#ffffff';
  drawEllipticalStroke(maskContext, stroke);

  const feather = Math.max(1, Math.min(stroke.radiusX, stroke.radiusY) * 0.16);
  featherContext.filter = `blur(${feather.toFixed(2)}px)`;
  featherContext.drawImage(mask, 0, 0);
  featherContext.filter = 'none';

  blurContext.globalCompositeOperation = 'destination-in';
  blurContext.drawImage(featheredMask, 0, 0);
  blurContext.globalCompositeOperation = 'source-over';
  outputContext.drawImage(blurred, 0, 0);

  try {
    return await canvasToDataUrl(output);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error(
        'This image server does not allow localized editing. Upload the image first, then try again.'
      );
    }
    throw error;
  }
}
