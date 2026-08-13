import { describe, it, expect } from 'vitest';
import {
  rgbToHeightBuffer,
  applyBoxBlurIterations,
  computeNormalMapFromHeight,
  computeNormalMapImageData,
} from './normalMapGenerator';

/** jsdom may not expose `ImageData`; generator only needs width/height/data */
function mockImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
}

function makeSolidImageData(width: number, height: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return mockImageData(width, height, data);
}

describe('normalMapGenerator', () => {
  it('flat color yields neutral tangent normal (~128,128,255)', () => {
    const img = makeSolidImageData(8, 8, 100, 120, 140);
    const h = rgbToHeightBuffer(img, false);
    const out = computeNormalMapFromHeight(h, 8, 8, { strength: 2, filter: 'sobel' });
    const mid = out.data[4 * (4 * 8 + 4)]!;
    const midG = out.data[4 * (4 * 8 + 4) + 1]!;
    const midB = out.data[4 * (4 * 8 + 4) + 2]!;
    expect(mid).toBeGreaterThan(125);
    expect(mid).toBeLessThan(132);
    expect(midG).toBeGreaterThan(125);
    expect(midG).toBeLessThan(132);
    expect(midB).toBeGreaterThan(250);
  });

  it('horizontal luminance ramp tilts normal along X (R channel shifts from mid)', () => {
    const w = 16;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x / (w - 1)) * 255);
        const o = (y * w + x) * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    const img = mockImageData(w, h, data);
    const out = computeNormalMapImageData(img, {
      strength: 4,
      invert: false,
      filter: 'sobel',
      blurRadius: 0,
      maxSize: 2048,
    });
    const ix = 8;
    const iy = 4;
    const o = (iy * w + ix) * 4;
    const r = out.data[o]!;
    const g = out.data[o + 1]!;
    expect(r).toBeLessThan(120);
    expect(Math.abs(g - 128)).toBeLessThan(15);
  });

  it('invert flips height interpretation (ramp R differs)', () => {
    const w = 12;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x / (w - 1)) * 255);
        const o = (y * w + x) * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    const img = mockImageData(w, h, data);
    const direct = computeNormalMapImageData(img, {
      strength: 3,
      invert: false,
      filter: 'scharr',
      blurRadius: 0,
      maxSize: 2048,
    });
    const inverted = computeNormalMapImageData(img, {
      strength: 3,
      invert: true,
      filter: 'scharr',
      blurRadius: 0,
      maxSize: 2048,
    });
    const ix = 6;
    const iy = 3;
    const o = (iy * w + ix) * 4;
    expect(direct.data[o]).not.toBe(inverted.data[o]);
  });

  it('blur iterations change normals vs none when height has a sharp spike', () => {
    const img = makeSolidImageData(8, 8, 200, 200, 200);
    img.data[0] = 0;
    img.data[1] = 0;
    img.data[2] = 0;
    const none = computeNormalMapImageData(img, {
      strength: 5,
      invert: false,
      filter: 'sobel',
      blurRadius: 0,
      maxSize: 2048,
    });
    const blurred = computeNormalMapImageData(img, {
      strength: 5,
      invert: false,
      filter: 'sobel',
      blurRadius: 3,
      maxSize: 2048,
    });
    expect(none.data[0]).not.toBe(blurred.data[0]);
  });

  it('applyBoxBlurIterations leaves uniform field uniform', () => {
    const w = 5;
    const h = 5;
    const src = new Float32Array(w * h).fill(0.42);
    const blurred = applyBoxBlurIterations(src, w, h, 3);
    expect(blurred.every((v) => Math.abs(v - 0.42) < 1e-6)).toBe(true);
  });
});
