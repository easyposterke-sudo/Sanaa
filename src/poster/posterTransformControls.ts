import { controlsUtils } from 'fabric';

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

function drawRotationHandle(ctx: CanvasRenderingContext2D, left: number, top: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, 9, 0, Math.PI * 2);
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
  ctx.arc(left, top, 4.5, 0.8 * Math.PI, 2.15 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left + 3.9, top + 3.7);
  ctx.lineTo(left + 5.3, top + 1.5);
  ctx.lineTo(left + 6.5, top + 4.2);
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
  corner.offsetX = corner.offsetY = 4;
  corner.sizeX = corner.sizeY = 18;
  corner.touchSizeX = corner.touchSizeY = 40;
  corner.render = (ctx, left, top) => drawHandle(ctx, left, top, 6);

  const right = controls.mr;
  right.offsetX = 4;
  right.sizeX = right.sizeY = 16;
  right.touchSizeX = right.touchSizeY = 36;
  right.render = (ctx, left, top) => drawHandle(ctx, left, top, 4.5);

  const bottom = controls.mb;
  bottom.offsetY = 4;
  bottom.sizeX = bottom.sizeY = 16;
  bottom.touchSizeX = bottom.touchSizeY = 36;
  bottom.render = (ctx, left, top) => drawHandle(ctx, left, top, 4.5);

  const rotate = controls.mtr;
  rotate.sizeX = rotate.sizeY = 22;
  rotate.touchSizeX = rotate.touchSizeY = 40;
  rotate.render = (ctx, left, top) => drawRotationHandle(ctx, left, top);

  return controls;
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
