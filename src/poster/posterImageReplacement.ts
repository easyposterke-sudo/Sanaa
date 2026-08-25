import type { PosterImageElement } from './types';

export interface PosterImageDimensions {
  width: number;
  height: number;
}

/**
 * Compensate for different intrinsic pixels so a replacement keeps the same
 * displayed width and height. All appearance and layout fields are left alone.
 */
export function buildPosterImageReplacement(
  element: PosterImageElement,
  nextSrc: string,
  current: PosterImageDimensions,
  replacement: PosterImageDimensions,
): Partial<PosterImageElement> {
  const currentWidth = Math.max(1, current.width);
  const currentHeight = Math.max(1, current.height);
  const nextWidth = Math.max(1, replacement.width);
  const nextHeight = Math.max(1, replacement.height);
  return {
    src: nextSrc,
    scaleX: element.scaleX * (currentWidth / nextWidth),
    scaleY: element.scaleY * (currentHeight / nextHeight),
    originalSrc: undefined,
    userPosterImageId: undefined,
  };
}

export function readPosterImageDimensions(src: string): Promise<PosterImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, image.naturalWidth || image.width),
      height: Math.max(1, image.naturalHeight || image.height),
    });
    image.onerror = () => reject(new Error('The replacement image could not be decoded.'));
    image.src = src;
  });
}
