import { describe, expect, it } from 'vitest';
import type {
  PosterDesignerElementSummary,
  PosterDesignerOperation,
} from '../../../shared/ai/posterDesignerAgent';
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

  it('anchors organization and theme copy to the centered title axis', () => {
    const source = project();
    source.elements.push(
      {
        id: 'organization', type: 'text', text: 'Christ Ekklesia Fellowship Chapel',
        left: 540, top: 30, width: 360, fontSize: 30, fontFamily: 'Inter', fill: '#ffffff',
        textAlign: 'center', scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
      {
        id: 'theme', type: 'text', text: 'God the Loving Father',
        left: 100, top: 300, width: 600, fontSize: 42, fontFamily: 'Inter', fill: '#ffffff',
        textAlign: 'center', scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 4,
      },
    );
    const bindings = [
      { key: 'event_title', label: 'Event title', sourceElementId: 'title-1', kind: 'text' as const },
      { key: 'church_name', label: 'Church name', sourceElementId: 'organization', kind: 'text' as const },
      { key: 'theme', label: 'Theme', sourceElementId: 'theme', kind: 'text' as const },
    ];
    const summaries = collectPosterDesignerElementSummaries(source, bindings);
    expect(validatePosterDesignerLayout(source, summaries, ['title', 'organization', 'theme'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'off_axis' })]),
    );
    const stabilized = stabilizePosterDesignerLayout(source, summaries);
    const organization = stabilized.project.elements.find((element) => element.id === 'organization');
    const theme = stabilized.project.elements.find((element) => element.id === 'theme');
    expect(organization?.left).toBeCloseTo(320, -1);
    expect(theme?.left).toBeCloseTo(200, -1);
    expect(stabilized.skillVersion).toBe('poster-layout-skill/1.1.0');
  });

  it('centers related text on the panel that contains it', () => {
    const source = project();
    source.elements.push(
      {
        id: 'footer-panel', type: 'rect', left: 100, top: 700, width: 800, height: 220,
        fill: '#172554', scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
      {
        id: 'pastor', type: 'text', text: 'Lead pastor: Pst David Kituyi',
        left: 180, top: 750, width: 400, fontSize: 34, fontFamily: 'Inter', fill: '#ffffff',
        textAlign: 'center', scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 4,
      },
    );
    const bindings = [
      { key: 'lead_pastor', label: 'Lead pastor', sourceElementId: 'pastor', kind: 'text' as const },
    ];
    const summaries = collectPosterDesignerElementSummaries(source, bindings);
    const stabilized = stabilizePosterDesignerLayout(source, summaries);
    expect(stabilized.project.elements.find((element) => element.id === 'pastor')?.left).toBeCloseTo(300, -1);
  });

  it('detects repeated service times even when their wording and formatting differ', () => {
    const source = project();
    source.elements.push(
      {
        id: 'times-one', type: 'text', text: 'First service starts at 8am | Second service starts at 9:30am',
        left: 100, top: 600, width: 800, fontSize: 28, fontFamily: 'Inter', fill: '#ffffff',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
      {
        id: 'times-two', type: 'text', text: 'First service: 8:00 AM | Second service: 9:30 AM',
        left: 100, top: 670, width: 800, fontSize: 28, fontFamily: 'Inter', fill: '#ffffff',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 4,
      },
    );
    const summaries = collectPosterDesignerElementSummaries(source, []);
    expect(validatePosterDesignerLayout(source, summaries, ['time'])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'duplicate_text',
        elementIds: expect.arrayContaining(['times-one', 'times-two']),
      }),
    ]));
  });

  it('keeps separate logistics columns instead of collapsing all panel text to its center', () => {
    const source = project();
    source.elements = [
      {
        id: 'panel', type: 'rect', left: 50, top: 400, width: 900, height: 450,
        fill: '#ffffff', scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1,
      },
      {
        id: 'day', type: 'text', text: 'Sunday', left: 150, top: 480, width: 250,
        fontSize: 40, fontFamily: 'Inter', fill: '#111111', textAlign: 'center',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 2,
      },
      {
        id: 'date', type: 'text', text: '23rd August 2026', left: 180, top: 550, width: 250,
        fontSize: 30, fontFamily: 'Inter', fill: '#111111', textAlign: 'center',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
      {
        id: 'time-label', type: 'text', text: 'START AT', left: 590, top: 480, width: 220,
        fontSize: 30, fontFamily: 'Inter', fill: '#111111', textAlign: 'center',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 4,
      },
      {
        id: 'time', type: 'text', text: '8am', left: 610, top: 550, width: 220,
        fontSize: 40, fontFamily: 'Inter', fill: '#111111', textAlign: 'center',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 5,
      },
    ];
    const bindings = [
      { key: 'day', label: 'Day', sourceElementId: 'day', kind: 'text' as const },
      { key: 'date', label: 'Date', sourceElementId: 'date', kind: 'text' as const },
      { key: 'time_label', label: 'Start at', sourceElementId: 'time-label', kind: 'text' as const },
      { key: 'time', label: 'Time', sourceElementId: 'time', kind: 'text' as const },
    ];
    const stabilized = stabilizePosterDesignerLayout(
      source,
      collectPosterDesignerElementSummaries(source, bindings),
    );
    const byId = new Map(stabilized.project.elements.map((element) => [element.id, element]));
    const day = byId.get('day');
    const date = byId.get('date');
    const timeLabel = byId.get('time-label');
    const time = byId.get('time');
    expect((day?.left ?? 0) + 125).toBeCloseTo((date?.left ?? 0) + 125, -1);
    expect((timeLabel?.left ?? 0) + 110).toBeCloseTo((time?.left ?? 0) + 110, -1);
    expect((day?.left ?? 0) + 125).toBeLessThan(400);
    expect((time?.left ?? 0) + 110).toBeGreaterThan(600);
  });

  it('promotes a tiny theme to a readable subheading size', () => {
    const source = project();
    source.elements.push({
      id: 'small-theme', type: 'text', text: 'God the Loving Father', left: 200, top: 300,
      width: 600, fontSize: 12, fontFamily: 'Inter', fill: '#ffffff', textAlign: 'center',
      scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
    });
    const bindings = [
      { key: 'event_title', label: 'Event title', sourceElementId: 'title-1', kind: 'text' as const },
      { key: 'theme', label: 'Theme', sourceElementId: 'small-theme', kind: 'text' as const },
    ];
    const summaries = collectPosterDesignerElementSummaries(source, bindings);
    expect(validatePosterDesignerLayout(source, summaries, ['title', 'theme'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'theme_too_small', severity: 'error' })]),
    );
    const stabilized = stabilizePosterDesignerLayout(source, summaries);
    const theme = stabilized.project.elements.find((element) => element.id === 'small-theme');
    expect(theme?.type).toBe('text');
    if (theme?.type !== 'text') throw new Error('Expected theme text.');
    expect(theme.fontSize).toBeGreaterThanOrEqual(27);
  });

  it('moves a theme out from behind a foreground portrait', () => {
    const source = project();
    source.elements.push(
      {
        id: 'portrait', type: 'image', src: 'portrait.png', left: 40, top: 80,
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 3,
      },
      {
        id: 'portrait-theme', type: 'text', text: 'God the Loving Father', left: 250, top: 320,
        width: 420, fontSize: 16, fontFamily: 'Inter', fill: '#ffffff', textAlign: 'center',
        scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 4,
      },
    );
    const summaries: PosterDesignerElementSummary[] = [
      {
        id: 'title-1', type: 'text', semanticRole: 'title', text: 'Sunday Worship',
        box: { x: 0.1, y: 0.1, width: 0.7, height: 0.09 }, fontSizeRatio: 0.07,
        textAlign: 'center', fill: '#ffffff', zIndex: 1, agentCreated: false, locked: false,
      },
      {
        id: 'portrait', type: 'image', semanticRole: null, text: null,
        box: { x: 0.04, y: 0.08, width: 0.43, height: 0.65 }, fontSizeRatio: null,
        textAlign: null, fill: null, zIndex: 3, agentCreated: false, locked: false,
      },
      {
        id: 'portrait-theme', type: 'text', semanticRole: 'theme', text: 'God the Loving Father',
        box: { x: 0.25, y: 0.32, width: 0.42, height: 0.04 }, fontSizeRatio: 0.016,
        textAlign: 'center', fill: '#ffffff', zIndex: 4, agentCreated: false, locked: false,
      },
    ];
    expect(validatePosterDesignerLayout(source, summaries, ['title', 'theme'])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'text_image_overlap', severity: 'error' }),
        expect.objectContaining({ code: 'theme_too_small', severity: 'error' }),
      ]),
    );
    const stabilized = stabilizePosterDesignerLayout(source, summaries);
    const theme = stabilized.project.elements.find((element) => element.id === 'portrait-theme');
    expect(theme?.type).toBe('text');
    if (theme?.type !== 'text') throw new Error('Expected portrait theme text.');
    expect(theme.left).toBeGreaterThanOrEqual(490);
    expect(theme.fontSize).toBeGreaterThanOrEqual(27);
    expect(theme.textAlign).toBe('center');
  });

  it('applies text alignment when move_resize defines a text column', () => {
    const operation: PosterDesignerOperation = {
      ...addThemeOperation(),
      id: 'move_theme_column',
      kind: 'move_resize',
      elementId: 'title-1',
      text: null,
      box: { x: 0.2, y: 0.2, width: 0.6, height: 0.1 },
      textAlign: 'right',
    };
    const result = applyPosterDesignerOperations(project(), [], [operation]);
    expect(result.project.elements.find((element) => element.id === 'title-1')).toMatchObject({
      left: 200,
      width: 600,
      textAlign: 'right',
    });
  });
});
