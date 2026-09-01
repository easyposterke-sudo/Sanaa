import { describe, expect, it } from 'vitest';
import type { PosterDesignerOperation } from '../../../shared/ai/posterDesignerAgent';
import type { PosterProject } from '../types';
import {
  applyPosterDesignerOperations,
  collectPosterDesignerElementSummaries,
  validatePosterDesignerLayout,
} from './posterDesignerAgentTools';

function project(): PosterProject {
  return {
    canvasWidth: 1000,
    canvasHeight: 1000,
    canvasBackground: { type: 'solid', color: '#111111' },
    elements: [
      {
        id: 'title-1',
        type: 'text',
        left: 100,
        top: 100,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex: 1,
        text: 'Sunday Worship',
        width: 700,
        fontSize: 70,
        fontFamily: 'Arial Black',
        fill: '#ffffff',
        textAlign: 'center',
      },
      {
        id: 'locked-logo',
        type: 'rect',
        left: 20,
        top: 20,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex: 2,
        locked: true,
        fill: '#ffffff',
        width: 100,
        height: 100,
      },
    ],
  };
}

function addThemeOperation(): PosterDesignerOperation {
  return {
    id: 'add_theme',
    kind: 'add_text',
    elementId: null,
    semanticRole: 'theme',
    text: 'Arise and Worship',
    box: { x: 0.1, y: 0.3, width: 0.8, height: 0.08 },
    fontFamily: 'Poppins',
    fontSizeRatio: 0.04,
    fontWeight: '800',
    textAlign: 'center',
    fill: '#facc15',
    reason: 'Add the supplied theme.',
  };
}

describe('poster designer browser tools', () => {
  it('adds semantic text as an editable layer and binding', () => {
    const result = applyPosterDesignerOperations(project(), [], [addThemeOperation()]);
    const added = result.project.elements.at(-1);
    expect(added).toMatchObject({
      type: 'text',
      text: 'Arise and Worship',
      left: 100,
      top: 300,
      width: 800,
      fontSize: 40,
      fill: '#facc15',
    });
    expect(result.fieldBindings[0]).toMatchObject({ key: 'agent_theme', kind: 'text' });
    expect(result.appliedOperationIds).toEqual(['add_theme']);
  });

  it('refuses to modify a locked layer', () => {
    const operation: PosterDesignerOperation = {
      ...addThemeOperation(),
      id: 'move_logo',
      kind: 'move_resize',
      elementId: 'locked-logo',
      semanticRole: null,
      text: null,
    };
    const result = applyPosterDesignerOperations(project(), [], [operation]);
    expect(result.appliedOperationIds).toEqual([]);
    expect(result.skipped[0]?.reason).toContain('locked');
  });

  it('reports missing semantic facts after deterministic inspection', () => {
    const source = project();
    const summaries = collectPosterDesignerElementSummaries(source, [
      { key: 'event_title', label: 'Event title', sourceElementId: 'title-1', kind: 'text' },
    ]);
    const issues = validatePosterDesignerLayout(source, summaries, ['title', 'theme']);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_fact', severity: 'error' }),
    ]));
  });
});
