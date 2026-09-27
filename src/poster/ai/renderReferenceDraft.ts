import { FabricImage, StaticCanvas } from 'fabric';
import { createFabricObject } from '../posterFabricFactory';
import { canvasBackgroundToCanvas2D, type PosterProject } from '../types';
import { loadFontsForPosterElements } from '../loadPosterFonts';
import { setFabricObjectGlassFill } from '../glassShapeFabric';
import { applyImageAdjustmentFilters } from '../imageEffects';

/** Same object factory as the editor, without changing its store, selection or canvas. */
export async function renderReferenceDraft(project: PosterProject, maxEdge = 1280): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, maxEdge / Math.max(project.canvasWidth, project.canvasHeight));
  const width = Math.max(1, Math.round(project.canvasWidth * scale));
  const height = Math.max(1, Math.round(project.canvasHeight * scale));
  const surface = document.createElement('canvas');
  const canvas = new StaticCanvas(surface, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    const layers = project.elements.filter(item => !item.excludeFromExport).sort((a, b) => a.zIndex - b.zIndex);
    await loadFontsForPosterElements(layers);
    for (const layer of layers) {
      const object = await createFabricObject(layer, true);
      if (!object) throw new Error(`Could not render ${layer.layerName ?? layer.type} for comparison.`);
      if ((layer.type === 'image' || layer.type === '3d-text') && object instanceof FabricImage) {
        applyImageAdjustmentFilters(object, layer);
      }
      if ('fill' in layer && typeof layer.fill === 'object' && layer.fill.type === 'glass') {
        setFabricObjectGlassFill(object, layer.fill, layer.fillOpacity ?? 1);
      }
      canvas.add(object);
    }
    canvas.renderAll();
    const output = document.createElement('canvas');
    output.width = width; output.height = height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Could not render the draft.');
    canvasBackgroundToCanvas2D(context, project.canvasBackground ?? { type: 'solid', color: '#ffffff' }, width, height);
    context.drawImage(surface, 0, 0);
    return output;
  } finally {
    await canvas.dispose();
  }
}
