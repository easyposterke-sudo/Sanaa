import { FabricImage, Textbox, type FabricObject } from 'fabric';
import type { PosterElementType } from './types';

/** A layer can keep its id while undo/redo changes its underlying Fabric kind. */
export function needsPosterFabricObjectRecreation(
  type: PosterElementType,
  object: FabricObject,
): boolean {
  if (type === 'text') return !(object instanceof Textbox);
  if (type === 'image' || type === '3d-text') return !(object instanceof FabricImage);
  return false;
}
