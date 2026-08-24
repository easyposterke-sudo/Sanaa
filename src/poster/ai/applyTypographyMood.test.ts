import { describe, expect, it } from 'vitest';
import type { PosterProject } from '../types';
import { applyTypographyMood } from './applyTypographyMood';

describe('applyTypographyMood', () => {
  it('styles the title more strongly while preserving poster content and geometry', () => {
    const project = {
      canvasWidth: 1080,
      canvasHeight: 1350,
      canvasBackgroundColor: '#ffffff',
      elements: [
        {
          id: 'title', type: 'text', text: 'SUNDAY SERVICE', fontSize: 90,
          fontFamily: 'Arial', fill: '#111111', left: 100, top: 100,
          scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 2,
        },
        {
          id: 'details', type: 'text', text: '10:00 AM', fontSize: 30,
          fontFamily: 'Arial', fill: '#111111', left: 100, top: 300,
          scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
        },
      ],
    } satisfies PosterProject;
    const changed = applyTypographyMood(project, 'bold');
    expect(changed.elements[0]).toMatchObject({
      text: 'SUNDAY SERVICE',
      left: 100,
      fontFamily: '"Anton", sans-serif',
      fontWeight: '900',
    });
    expect(changed.elements[1]).toMatchObject({
      text: '10:00 AM',
      fontFamily: '"Oswald", sans-serif',
    });
  });
});
