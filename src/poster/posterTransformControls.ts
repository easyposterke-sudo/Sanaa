import { controlsUtils, type FabricObject } from 'fabric';

function drawHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f2937';
  ctx.stroke();
  ctx.restore();
}

function drawRotationHandle(ctx: CanvasRenderingContext2D, left: number, top: number, scale: number) {
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f2937';
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0.8 * Math.PI, 2.15 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3.9, 3.7);
  ctx.lineTo(5.3, 1.5);
  ctx.lineTo(6.5, 4.2);
  ctx.stroke();
  ctx.restore();
}

export function createPosterTransformControls(isText = false) {
  // Keep Fabric's original handlers, including Textbox's width-changing side handles.
  const controls = isText
    ? controlsUtils.createTextboxDefaultControls()
    : controlsUtils.createObjectDefaultControls();

  // Hidden handles still receive pointer input and retain their original actions.
  for (const key of ['tl', 'tr', 'bl', 'ml', 'mt'] as const) {
    controls[key].render = () => {};
  }

  const corner = controls.br;
  corner.offsetX = corner.offsetY = 7;
  corner.sizeX = corner.sizeY = 22;
  corner.touchSizeX = corner.touchSizeY = 38;
  corner.render = (ctx, left, top) => drawHandle(ctx, left, top, corner.sizeX * 0.34);

  const right = controls.mr;
  right.offsetX = 7;
  right.sizeX = right.sizeY = 20;
  right.touchSizeX = right.touchSizeY = 34;
  right.render = (ctx, left, top) => drawHandle(ctx, left, top, right.sizeX * 0.34);

  const bottom = controls.mb;
  bottom.offsetY = 7;
  bottom.sizeX = bottom.sizeY = 20;
  bottom.touchSizeX = bottom.touchSizeY = 34;
  bottom.render = (ctx, left, top) => drawHandle(ctx, left, top, bottom.sizeX * 0.34);

  const rotate = controls.mtr;
  rotate.sizeX = rotate.sizeY = 22;
  rotate.touchSizeX = rotate.touchSizeY = 40;
  rotate.render = (ctx, left, top) => drawRotationHandle(ctx, left, top, rotate.sizeX / 22);

  return controls;
}

/** Keep the controls legible when the poster is fitted into a narrow viewport. */
export function sizePosterTransformControls(object: FabricObject, displayScale: number) {
  const factor = Math.min(3, Math.max(1, 1 / Math.max(displayScale, 0.01)));
  const { br, mr, mb, mtr } = object.controls;
  br.offsetX = br.offsetY = 7 * factor;
  br.sizeX = br.sizeY = 22 * factor;
  br.touchSizeX = br.touchSizeY = 38 * factor;
  mr.offsetX = 7 * factor;
  mr.sizeX = mr.sizeY = 20 * factor;
  mr.touchSizeX = mr.touchSizeY = 34 * factor;
  mb.offsetY = 7 * factor;
  mb.sizeX = mb.sizeY = 20 * factor;
  mb.touchSizeX = mb.touchSizeY = 34 * factor;
  mtr.sizeX = mtr.sizeY = 22 * factor;
  mtr.touchSizeX = mtr.touchSizeY = 40 * factor;
  object.setCoords();
}

export function posterTransformAppearance(isText = false) {
  return {
    controls: createPosterTransformControls(isText),
    borderColor: '#f59e0b',
    borderScaleFactor: 1.5,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#1f2937',
    cornerStyle: 'circle' as const,
    transparentCorners: false,
  };
}
