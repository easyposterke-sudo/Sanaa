import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POSTER_TEXT_BACKGROUND,
  calculatePosterTextBackgroundGeometry,
  normalizePosterTextBackground,
} from './textBackground';

describe('dynamic poster text backgrounds', () => {
  it('keeps proportional padding while expanding with measured text', () => {
    const background = { ...DEFAULT_POSTER_TEXT_BACKGROUND, enabled: true, paddingX: 50, paddingY: 25 };
    const short = calculatePosterTextBackgroundGeometry({
      textboxWidth: 400,
      contentWidth: 120,
      textHeight: 50,
      fontSize: 40,
      textAlign: 'center',
      background,
    });
    const long = calculatePosterTextBackgroundGeometry({
      textboxWidth: 400,
      contentWidth: 300,
      textHeight: 50,
      fontSize: 40,
      textAlign: 'center',
      background,
    });
    expect(short.width).toBe(160);
    expect(long.width).toBe(340);
    expect(short.height).toBe(70);
    expect(long.height).toBe(short.height);
  });

  it('grows circles uniformly around multiline text', () => {
    const geometry = calculatePosterTextBackgroundGeometry({
      textboxWidth: 240,
      contentWidth: 180,
      textHeight: 140,
      fontSize: 40,
      textAlign: 'center',
      background: {
        ...DEFAULT_POSTER_TEXT_BACKGROUND,
        enabled: true,
        shape: 'circle',
      },
    });
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.radius).toBe(geometry.height / 2);
  });

  it('normalizes older and incomplete saved settings safely', () => {
    expect(normalizePosterTextBackground(undefined)).toEqual(DEFAULT_POSTER_TEXT_BACKGROUND);
    expect(
      normalizePosterTextBackground({ enabled: true, fill: 'glass', opacity: 9, blur: -10 }),
    ).toMatchObject({ enabled: true, fill: 'glass', opacity: 1, blur: 0 });
  });
});
