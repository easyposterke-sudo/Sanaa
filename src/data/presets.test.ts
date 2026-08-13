import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';

describe('3D presets', () => {
  it('includes a closed, rounded single-material gold preset', () => {
    const preset = PRESETS.find((item) => item.name === 'Kellan Gold (Single Material)');

    expect(preset).toBeDefined();
    expect(preset?.state).toMatchObject({
      renderEngine: 'webgl',
      extrusionOnly: true,
      text: { fontFamily: 'Century Gothic, sans-serif', letterSpacing: 8 },
      frontColor: '#d4af37',
      extrusionColor: '#d4af37',
      inflate: 0.15,
      bevelSegments: 10,
      curveSegments: 16,
      filters: { edgeRoundness: 0.6 },
    });
  });

  it('keeps preset names unique', () => {
    const names = PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
