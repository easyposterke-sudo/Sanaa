import { FabricImage, Textbox } from 'fabric';
import { describe, expect, it } from 'vitest';
import { needsPosterFabricObjectRecreation } from './posterFabricObjectType';

describe('poster Fabric object type changes', () => {
  it('recreates a 3D image as a textbox on undo and a textbox as an image on redo', () => {
    const image = new FabricImage(document.createElement('img'));
    const text = new Textbox('Jacob', { width: 300 });

    expect(needsPosterFabricObjectRecreation('text', image)).toBe(true);
    expect(needsPosterFabricObjectRecreation('3d-text', text)).toBe(true);
    expect(needsPosterFabricObjectRecreation('text', text)).toBe(false);
    expect(needsPosterFabricObjectRecreation('3d-text', image)).toBe(false);
  });
});
