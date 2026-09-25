import { controlsUtils } from 'fabric';

const CORNER_KEYS = ['tl', 'tr', 'bl', 'br'] as const;
const HORIZONTAL_KEYS = ['ml', 'mr'] as const;
const VERTICAL_KEYS = ['mt', 'mb'] as const;

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
  ctx.arc(left, top, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f2937';
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(left, top, 6.5, 0.8 * Math.PI, 2.15 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left + 5.8, top + 5.1);
  ctx.lineTo(left + 7.5, top + 2.3);
  ctx.lineTo(left + 9.2, top + 5.8);
  ctx.stroke();
  ctx.restore();
}

export function createPosterTransformControls() {
  const controls = controlsUtils.createObjectDefaultControls();

  for (const key of CORNER_KEYS) {
    const control = controls[key];
    control.sizeX = control.sizeY = 26;
    control.touchSizeX = control.touchSizeY = 48;
    control.render = (ctx, left, top) => drawHandle(ctx, left, top, 10);
  }

  for (const key of HORIZONTAL_KEYS) {
    const control = controls[key];
    control.actionHandler = controlsUtils.scalingX;
    control.cursorStyleHandler = controlsUtils.scaleCursorStyleHandler;
    control.getActionName = () => 'scaleX';
    control.sizeX = control.sizeY = 24;
    control.touchSizeX = control.touchSizeY = 48;
    control.render = (ctx, left, top) => drawHandle(ctx, left, top, 6.5);
  }

  for (const key of VERTICAL_KEYS) {
    const control = controls[key];
    control.actionHandler = controlsUtils.scalingY;
    control.cursorStyleHandler = controlsUtils.scaleCursorStyleHandler;
    control.getActionName = () => 'scaleY';
    control.sizeX = control.sizeY = 24;
    control.touchSizeX = control.touchSizeY = 48;
    control.render = (ctx, left, top) => drawHandle(ctx, left, top, 6.5);
  }

  const rotate = controls.mtr;
  rotate.x = -0.5;
  rotate.y = 0.5;
  rotate.offsetX = -34;
  rotate.offsetY = 34;
  rotate.withConnection = true;
  rotate.sizeX = rotate.sizeY = 30;
  rotate.touchSizeX = rotate.touchSizeY = 50;
  rotate.render = (ctx, left, top) => drawRotationHandle(ctx, left, top);

  return controls;
}

export function posterTransformAppearance() {
  return {
    controls: createPosterTransformControls(),
    borderColor: '#f59e0b',
    borderScaleFactor: 1.5,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#1f2937',
    cornerStyle: 'circle' as const,
    transparentCorners: false,
    cornerSize: 26,
    touchCornerSize: 48,
  };
}
