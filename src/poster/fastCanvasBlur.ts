import {
  filters as FabricFilters,
  util,
  type T2DPipelineState,
  type TWebGLPipelineState,
} from 'fabric';

type FastCanvasBlurProps = {
  blur: number;
};

type FastBlurResources = {
  fastCanvasBlurSource?: HTMLCanvasElement;
};

const BLUR_RADIUS_SCALE = 0.05;
export const MAX_FAST_BLUR_RADIUS = 128;

/**
 * Match Fabric's dimension-relative blur closely while keeping very large
 * images within a practical native-canvas blur radius.
 */
export function getFastCanvasBlurRadius(
  width: number,
  height: number,
  blur: number
): number {
  if (width <= 0 || height <= 0) return 0;
  const amount = Math.max(0, Math.min(1, blur));
  return Math.min(
    MAX_FAST_BLUR_RADIUS,
    amount * BLUR_RADIUS_SCALE * Math.min(width, height)
  );
}

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/**
 * Fabric's Canvas2D blur performs a large JavaScript sampling loop per pixel.
 * This filter uses the browser's optimized native canvas blur instead, while
 * retaining Fabric's WebGL blur if a WebGL filter backend is ever enabled.
 */
export class FastCanvasBlurFilter extends FabricFilters.BaseFilter<
  'FastCanvasBlur',
  FastCanvasBlurProps
> {
  static type = 'FastCanvasBlur';
  static defaults: FastCanvasBlurProps = { blur: 0 };

  declare blur: number;

  isNeutralState(): boolean {
    return this.blur <= 0;
  }

  applyTo(options: TWebGLPipelineState | T2DPipelineState): void {
    if ('webgl' in options) {
      new FabricFilters.Blur({ blur: this.blur }).applyTo(options);
      return;
    }
    this.applyTo2d(options);
  }

  applyTo2d(options: T2DPipelineState): void {
    const { width, height } = options.imageData;
    const radius = getFastCanvasBlurRadius(width, height, this.blur);
    if (radius <= 0) return;

    const resources = options.filterBackend.resources as FastBlurResources;
    const source = resources.fastCanvasBlurSource ?? util.createCanvasElement();
    resources.fastCanvasBlurSource = source;
    sizeCanvas(source, width, height);

    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    const targetCtx = options.ctx;
    if (!sourceCtx || !targetCtx || typeof targetCtx.filter !== 'string') {
      new FabricFilters.Blur({ blur: this.blur }).applyTo2d(options);
      return;
    }

    sourceCtx.putImageData(options.imageData, 0, 0);
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.save();
    targetCtx.filter = `blur(${radius.toFixed(2)}px)`;
    targetCtx.drawImage(source, 0, 0);
    targetCtx.restore();
    options.imageData = targetCtx.getImageData(0, 0, width, height);
  }
}
