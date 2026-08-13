import type { PosterImageElement, Poster3DTextElement } from './types';

export type PosterRasterElement = PosterImageElement | Poster3DTextElement;

export function posterRasterSrc(el: PosterRasterElement): string {
  return el.type === '3d-text' ? el.image : el.src;
}
