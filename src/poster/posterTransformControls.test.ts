import { Rect, controlsUtils } from 'fabric';
import { describe, expect, it } from 'vitest';
import { createPosterTransformControls, posterTransformAppearance, sizePosterTransformControls } from './posterTransformControls';
import { DynamicBackgroundTextbox } from './DynamicBackgroundTextbox';

describe('poster transform controls', () => {
  it('keeps the original text wrapping and shape transform actions', () => {
    const text = new DynamicBackgroundTextbox('Title', { ...posterTransformAppearance(true), width: 200 });
    const shape = new Rect({ ...posterTransformAppearance(), width: 200, height: 100 });
    const defaultText = new DynamicBackgroundTextbox('Title', { width: 200 });
    const defaultShape = new Rect({ width: 200, height: 100 });

    for (const key of ['tl', 'tr', 'bl', 'br', 'ml', 'mr', 'mt', 'mb', 'mtr'] as const) {
      expect(text.controls[key].actionHandler).toBe(defaultText.controls[key].actionHandler);
      expect(shape.controls[key].actionHandler).toBe(defaultShape.controls[key].actionHandler);
      expect(text.controls[key].visible).toBe(true);
    }
    expect(text.controls.mr.actionHandler).toBe(controlsUtils.changeWidth);
    expect(text.controls.ml.actionHandler).toBe(controlsUtils.changeWidth);
    expect(text.controls.mr.touchSizeX).toBe(34);
    expect(text.controls.br.touchSizeY).toBe(38);
  });

  it('keeps rotation above the selection and draws only three resize handles', () => {
    const controls = createPosterTransformControls();
    expect(controls.mtr.actionHandler).toBe(controlsUtils.rotationWithSnapping);
    expect(controls.mtr.x).toBe(0);
    expect(controls.mtr.y).toBe(-0.5);
    expect(controls.mtr.offsetY).toBe(-40);
    expect(controls.mtr.touchSizeX).toBe(40);
    expect(controls.tl.sizeX).toBe(0);
    expect(controls.br.sizeX).toBe(22);
    expect(controls.mr.sizeX).toBe(20);
    expect(controls.mb.sizeX).toBe(20);
  });

  it('enlarges controls at reduced display scale without changing their actions', () => {
    const text = new DynamicBackgroundTextbox('Title', { ...posterTransformAppearance(true), width: 200 });
    const originalWidthAction = text.controls.mr.actionHandler;
    sizePosterTransformControls(text, 0.5);
    expect(text.controls.br.sizeX).toBe(44);
    expect(text.controls.mr.sizeX).toBe(40);
    expect(text.controls.mb.sizeY).toBe(40);
    expect(text.controls.mr.touchSizeX).toBe(68);
    expect(text.controls.mr.actionHandler).toBe(originalWidthAction);
    expect(text.controls.mtr.offsetY).toBe(-40);
  });
});
