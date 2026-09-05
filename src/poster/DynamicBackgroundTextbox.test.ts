import { describe, expect, it, vi } from 'vitest';
import { DynamicBackgroundTextbox } from './DynamicBackgroundTextbox';
import { buildPosterTextEffectStyles } from './textEffects';

describe('DynamicBackgroundTextbox curved text rendering', () => {
  it('rotates curved glyphs around their individual baseline positions', () => {
    const text = new DynamicBackgroundTextbox('ABCDE', {
      width: 260,
      fontSize: 40,
      fill: '#111111',
      styles: buildPosterTextEffectStyles('ABCDE', 40, 60, 0),
    });
    const rotate = vi.fn();
    const context = {
      canvas: { setAttribute: vi.fn() },
      direction: 'ltr',
      textAlign: 'left',
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate,
      fillText: vi.fn(),
      fillStyle: '#111111',
      font: '',
    } as unknown as CanvasRenderingContext2D;

    // Fabric's normal render pass measures each line before painting it.
    text.getLineWidth(0);
    text._renderChars('fillText', context, Array.from('ABCDE'), -130, 0, 0);

    const angles = rotate.mock.calls.map(([angle]) => angle as number);
    expect(angles.some((angle) => angle < 0)).toBe(true);
    expect(angles.some((angle) => angle > 0)).toBe(true);
    expect(context.fillText).toHaveBeenCalledTimes(5);
  });

  it('keeps straight text on the unrotated Fabric render path', () => {
    const text = new DynamicBackgroundTextbox('ABC', {
      width: 200,
      fontSize: 40,
      fill: '#111111',
      styles: buildPosterTextEffectStyles('ABC', 40, 0, 0),
    });
    const rotate = vi.fn();
    const context = {
      canvas: { setAttribute: vi.fn() },
      direction: 'ltr',
      textAlign: 'left',
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate,
      fillText: vi.fn(),
      fillStyle: '#111111',
      font: '',
    } as unknown as CanvasRenderingContext2D;

    text._renderChars('fillText', context, Array.from('ABC'), -100, 0, 0);

    expect(rotate).not.toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledTimes(1);
  });
});
