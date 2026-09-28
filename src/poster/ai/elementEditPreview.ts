import type { PosterElementEditRequest } from '../../../shared/ai/posterElementEdit';

type Box = PosterElementEditRequest['selected']['box'];

/** One mapping for every comparison image; includes context and proposed moves. */
export function elementEditDetailBox(boxes: Box[]): Box {
  const left = Math.min(...boxes.map(box => box.x));
  const top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  const padX = Math.max(0.025, (right - left) * 0.15);
  const padY = Math.max(0.025, (bottom - top) * 0.15);
  const x = Math.max(0, Math.min(0.99, left - padX));
  const y = Math.max(0, Math.min(0.99, top - padY));
  return { x, y, width: Math.max(0.01, Math.min(1, right + padX) - x), height: Math.max(0.01, Math.min(1, bottom + padY) - y) };
}

export async function cropElementEditDetail(dataUrl: string, box: Box): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not prepare the selected-layer comparison.'));
    image.src = dataUrl;
  });
  const sw = image.naturalWidth * box.width;
  const sh = image.naturalHeight * box.height;
  const scale = Math.min(4, 1024 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the selected-layer comparison.');
  context.drawImage(image, box.x * image.naturalWidth, box.y * image.naturalHeight, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.94);
}
