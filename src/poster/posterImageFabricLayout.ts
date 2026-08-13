import type { FabricImage } from 'fabric';
import type { PosterImageElement, Poster3DTextElement } from './types';
import type { PosterRasterElement } from './posterRaster';

/** For circle mask, use square scale so the element bounds match the circle (no rect-with-circle look). */
export function getMaskedImageScale(
  el: PosterImageElement | Poster3DTextElement,
  imgWidth: number,
  imgHeight: number
): { scaleX: number; scaleY: number } {
  const mask = el.mask ?? 'none';
  if (mask === 'circle' && imgWidth > 0 && imgHeight > 0) {
    const displayedW = imgWidth * el.scaleX;
    const displayedH = imgHeight * el.scaleY;
    const targetSize = Math.min(displayedW, displayedH);
    return {
      scaleX: targetSize / imgWidth,
      scaleY: targetSize / imgHeight,
    };
  }
  return { scaleX: el.scaleX, scaleY: el.scaleY };
}

export function applyImageFlip(
  scale: { scaleX: number; scaleY: number },
  el: PosterImageElement | Poster3DTextElement
): { scaleX: number; scaleY: number } {
  let { scaleX, scaleY } = scale;
  if (el.flipHorizontal) scaleX *= -1;
  if (el.flipVertical) scaleY *= -1;
  return { scaleX, scaleY };
}

/**
 * Re-apply position and scale (including mask + flip rules) after `setSrc` or other operations that reset Fabric transforms.
 */
export function setFabricRasterLayoutFromElement(img: FabricImage, el: PosterRasterElement): void {
  const w = img.width ?? 1;
  const h = img.height ?? 1;
  const baseScale =
    (el.mask ?? 'none') !== 'none' ? getMaskedImageScale(el, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
  const scale = applyImageFlip(baseScale, el);
  img.set({
    left: el.left,
    top: el.top,
    scaleX: scale.scaleX,
    scaleY: scale.scaleY,
    angle: el.angle,
    opacity: el.opacity,
    originX: 'left',
    originY: 'top',
  });
  img.setCoords();
}
