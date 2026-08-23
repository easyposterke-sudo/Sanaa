import { describe, expect, it } from 'vitest';
import { applyTemplateTheme } from './applyTemplateTheme';
import type { PosterProject } from '../types';

describe('applyTemplateTheme', () => {
  it('recolors canvas and chromatic vector shapes without changing images or neutral panels', () => {
    const project: PosterProject = {
      canvasWidth: 800,
      canvasHeight: 600,
      canvasBackground: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#1e3a8a' },
          { offset: 1, color: '#4c1d95' },
        ],
      },
      elements: [
        {
          id: 'shape',
          type: 'rect',
          left: 0,
          top: 0,
          width: 20,
          height: 20,
          fill: '#f59e0b',
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 1,
        },
        {
          id: 'neutral',
          type: 'circle',
          left: 0,
          top: 0,
          radius: 20,
          fill: 'rgba(255,255,255,0.25)',
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 2,
        },
        {
          id: 'photo',
          type: 'image',
          src: 'data:image/png;base64,abc',
          left: 0,
          top: 0,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
          zIndex: 3,
        },
      ],
    };

    const themed = applyTemplateTheme(project, '#16a34a');
    expect(themed).not.toBe(project);
    expect(themed.canvasBackground).not.toEqual(project.canvasBackground);
    expect(themed.elements[0]).toMatchObject({ type: 'rect' });
    expect((themed.elements[0] as { fill: string }).fill).not.toBe('#f59e0b');
    expect((themed.elements[1] as { fill: string }).fill).toBe('rgba(255,255,255,0.25)');
    expect(themed.elements[2]).toEqual(project.elements[2]);
  });

  it('returns the original project for an invalid color', () => {
    const project: PosterProject = { canvasWidth: 10, canvasHeight: 10, elements: [] };
    expect(applyTemplateTheme(project, 'green')).toBe(project);
  });
});
