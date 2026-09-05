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

  it('makes a complete circle at the maximum curve', () => {
    const wording = 'AAAAAAAAAAAAAAAA';
    const text = new DynamicBackgroundTextbox(wording, {
      width: 600,
      fontSize: 40,
      fill: '#111111',
      styles: buildPosterTextEffectStyles(wording, 40, 100, 0),
    });
    const translations: Array<[number, number]> = [];
    const rotations: number[] = [];
    const context = {
      canvas: { setAttribute: vi.fn() },
      direction: 'ltr',
      textAlign: 'left',
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn((x: number, y: number) => translations.push([x, y])),
      rotate: vi.fn((angle: number) => rotations.push(angle)),
      fillText: vi.fn(),
      fillStyle: '#111111',
      font: '',
    } as unknown as CanvasRenderingContext2D;

    text.getLineWidth(0);
    text._renderChars('fillText', context, Array.from(wording), -300, 0, 0);

    const distance = (a: [number, number], b: [number, number]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1]);
    const ordinaryGap = distance(translations[0], translations[1]);
    const seamGap = distance(translations[0], translations[translations.length - 1]);
    expect(text.height).toBeGreaterThan(550);
    expect(seamGap).toBeCloseTo(ordinaryGap, 5);
    expect(rotations[0]).toBeLessThan(-2.5);
    expect(rotations[rotations.length - 1]).toBeGreaterThan(2.5);
  });
});
