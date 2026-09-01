import { describe, expect, it } from 'vitest';
import type { PosterDesignerOperation } from '../../../shared/ai/posterDesignerAgent';
import type { PosterProject } from '../types';
import {
  applyPosterDesignerOperations,
  collectPosterDesignerElementSummaries,
  stabilizePosterDesignerLayout,
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
    fillOpacity: null,
    cornerRadiusRatio: null,
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

  it('creates an editable rounded panel behind its anchor text', () => {
    const operation: PosterDesignerOperation = {
      id: 'add_info_panel',
      kind: 'add_panel',
      elementId: 'title-1',
      semanticRole: null,
      text: null,
      box: { x: 0.08, y: 0.58, width: 0.84, height: 0.22 },
      fontFamily: null,
      fontSizeRatio: null,
      fontWeight: null,
      textAlign: null,
      fill: '#172554',
      fillOpacity: 0.82,
      cornerRadiusRatio: 0.12,
      reason: 'Group the event logistics in one visual card.',
    };
    const result = applyPosterDesignerOperations(project(), [], [operation]);
    const panel = result.project.elements.find((element) => element.layerName === 'Agent: information panel');
    const title = result.project.elements.find((element) => element.id === 'title-1');
    expect(panel).toMatchObject({
      type: 'rect',
      left: 80,
      top: 580,
      width: 840,
      height: 220,
      fill: '#172554',
      fillOpacity: 0.82,
    });
    expect(panel!.zIndex).toBeLessThan(title!.zIndex);
  });

  it('detects duplicate title roles even when their capitalization differs', () => {
    const source = project();
    const originalTitle = source.elements.find((element) => element.id === 'title-1');
    if (!originalTitle || originalTitle.type !== 'text') throw new Error('Expected a text title fixture.');
    source.elements.push({
      ...originalTitle,
      id: 'agent-title',
      layerName: 'Agent: Title',
      top: 210,
      zIndex: 3,
      text: 'SUNDAY WORSHIP',
    });
    const summaries = collectPosterDesignerElementSummaries(source, [
      { key: 'event_title', label: 'Event title', sourceElementId: 'title-1', kind: 'text' },
      { key: 'agent_title', label: 'Title', sourceElementId: 'agent-title', kind: 'text' },
    ]);
    const issues = validatePosterDesignerLayout(source, summaries, ['title']);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_text' }),
      expect.objectContaining({ code: 'duplicate_semantic_role', severity: 'error' }),
    ]));
  });

  it('hides only a verified duplicate and transfers its semantic binding to the survivor', () => {
    const source = project();
    const originalTitle = source.elements.find((element) => element.id === 'title-1');
    if (!originalTitle || originalTitle.type !== 'text') throw new Error('Expected a text title fixture.');
    source.elements.push({
      ...originalTitle,
      id: 'agent-title',
      layerName: 'Agent: Title',
      top: 210,
      zIndex: 3,
      text: 'SUNDAY WORSHIP',
    });
    const operation: PosterDesignerOperation = {
      id: 'hide_repeated_title',
      kind: 'hide_duplicate_text',
      elementId: 'agent-title',
      semanticRole: 'title',
      text: null,
      box: null,
      fontFamily: null,
      fontSizeRatio: null,
      fontWeight: null,
      textAlign: null,
      fill: null,
      fillOpacity: null,
      cornerRadiusRatio: null,
      reason: 'Keep the integrated template title and remove the repeated agent copy.',
    };
    const result = applyPosterDesignerOperations(source, [
      { key: 'event_title', label: 'Event title', sourceElementId: 'title-1', kind: 'text' },
      { key: 'agent_title', label: 'Title', sourceElementId: 'agent-title', kind: 'text' },
    ], [operation]);
    expect(result.project.elements.find((element) => element.id === 'agent-title')?.opacity).toBe(0);
    expect(result.fieldBindings.every((binding) => binding.sourceElementId === 'title-1')).toBe(true);
  });

  it('recognizes an agent title as duplicating a split unlabeled template headline', () => {
    const source = project();
    source.elements = [
      {
        id: 'fixed-sunday', type: 'text', text: 'SUNDAY', left: 80, top: 60, width: 760,
        fontSize: 120, fontFamily: 'Impact', fill: '#ffffff', scaleX: 1, scaleY: 1,
        angle: 0, opacity: 1, zIndex: 1,
      },
      {
        id: 'fixed-service', type: 'text', text: 'SERVICE', left: 140, top: 190, width: 700,
        fontSize: 100, fontFamily: 'Impact', fill: '#ffffff', scaleX: 1, scaleY: 1,
        angle: 0, opacity: 1, zIndex: 2,
      },
      {
        id: 'agent-title', type: 'text', layerName: 'Agent: Title', text: 'Sunday Service',
        left: 100, top: 330, width: 800, fontSize: 80, fontFamily: 'Inter', fill: '#ffffff',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
    ];
    const summaries = collectPosterDesignerElementSummaries(source, [
      { key: 'agent_title', label: 'Title', sourceElementId: 'agent-title', kind: 'text' },
    ]);
    expect(summaries.filter((summary) => summary.semanticRole === 'title')).toHaveLength(3);
    expect(validatePosterDesignerLayout(source, summaries, ['title'])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'duplicate_semantic_role',
        elementIds: expect.arrayContaining(['agent-title']),
      }),
    ]));
  });

  it('clamps unsafe requested boxes and fits long text inside its requested height', () => {
    const operation: PosterDesignerOperation = {
      ...addThemeOperation(),
      id: 'safe_long_detail',
      semanticRole: 'extra_details',
      text: 'Second service starts at 9:30am',
      box: { x: 0.9, y: 0.94, width: 0.5, height: 0.05 },
      fontSizeRatio: 0.08,
    };
    const result = applyPosterDesignerOperations(project(), [], [operation]);
    const added = result.project.elements.at(-1);
    expect(added?.type).toBe('text');
    if (added?.type !== 'text') throw new Error('Expected fitted text.');
    expect(added.left + (added.width ?? 0)).toBeLessThanOrEqual(975);
    expect(added.top).toBeLessThanOrEqual(925);
    expect(added.fontSize).toBeLessThan(50);
  });

  it('separates overlapping service times in the deterministic final layout guard', () => {
    const source = project();
    source.elements = [
      {
        id: 'time-one', type: 'text', text: '8am', left: 300, top: 720, width: 300,
        fontSize: 55, fontFamily: 'Inter', fill: '#ffffff', scaleX: 1, scaleY: 1,
        angle: 0, opacity: 1, zIndex: 1,
      },
      {
        id: 'time-two', type: 'text', text: '9:30am', left: 300, top: 730, width: 300,
        fontSize: 55, fontFamily: 'Inter', fill: '#ffffff', scaleX: 1, scaleY: 1,
        angle: 0, opacity: 1, zIndex: 2,
      },
    ];
    const bindings = [
      { key: 'first_time', label: 'First service time', sourceElementId: 'time-one', kind: 'text' as const },
      { key: 'second_time', label: 'Second service time', sourceElementId: 'time-two', kind: 'text' as const },
    ];
    const summaries = collectPosterDesignerElementSummaries(source, bindings);
    const stabilized = stabilizePosterDesignerLayout(source, summaries);
    const first = stabilized.project.elements.find((element) => element.id === 'time-one');
    const second = stabilized.project.elements.find((element) => element.id === 'time-two');
    expect(stabilized.adjustedElementIds).toContain('time-two');
    expect(Math.abs((first?.top ?? 0) - (second?.top ?? 0))).toBeGreaterThan(50);
  });
});
