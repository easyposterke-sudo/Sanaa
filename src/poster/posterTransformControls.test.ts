import { Rect, controlsUtils } from 'fabric';
import { describe, expect, it } from 'vitest';
import { createPosterTransformControls, posterTransformAppearance } from './posterTransformControls';
import { DynamicBackgroundTextbox } from './DynamicBackgroundTextbox';

describe('poster transform controls', () => {
  it('scales text and shapes by axis from their side handles', () => {
    const text = new DynamicBackgroundTextbox('Title', { ...posterTransformAppearance(), width: 200 });
    const shape = new Rect({ ...posterTransformAppearance(), width: 200, height: 100 });

    for (const object of [text, shape]) {
      expect(object.controls.ml.actionHandler).toBe(controlsUtils.scalingX);
      expect(object.controls.mr.actionHandler).toBe(controlsUtils.scalingX);
      expect(object.controls.mt.actionHandler).toBe(controlsUtils.scalingY);
      expect(object.controls.mb.actionHandler).toBe(controlsUtils.scalingY);
      expect(object.controls.br.actionHandler).toBe(controlsUtils.scalingEqually);
      expect(object.controls.mr.touchSizeX).toBeGreaterThanOrEqual(44);
      expect(object.controls.br.touchSizeY).toBeGreaterThanOrEqual(44);
    }
  });

  it('places a separate, touchable rotation control outside the selection', () => {
    const controls = createPosterTransformControls();
    expect(controls.mtr.actionHandler).toBe(controlsUtils.rotationWithSnapping);
    expect(controls.mtr.y).toBe(0.5);
    expect(controls.mtr.offsetX).toBeLessThan(0);
    expect(controls.mtr.offsetY).toBeGreaterThan(0);
    expect(controls.mtr.touchSizeX).toBeGreaterThanOrEqual(44);
  });
});
