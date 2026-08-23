import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePosterStore } from './posterStore';
import type { PosterTextElement, PosterElementInput } from '../types';

function makeTextEl(overrides: Partial<PosterTextElement> = {}): PosterElementInput {
  return {
    type: 'text',
    text: 'Hello',
    left: 100,
    top: 50,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    fontSize: 24,
    fontFamily: 'Arial',
    fill: '#000000',
    ...overrides,
  } as PosterElementInput;
}

function resetStore() {
  usePosterStore.setState({
    elements: [],
    canvasWidth: 800,
    canvasHeight: 600,
    canvasBackground: { type: 'solid', color: '#ffffff' },
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    fitCenterNonce: 1,
    selectedIds: [],
    history: [[]],
    historyIndex: 0,
    fieldBindings: null,
  });
}

beforeEach(() => {
  resetStore();
  vi.useFakeTimers();
});

describe('addElement', () => {
  it('adds an element and assigns id + zIndex', () => {
    const store = usePosterStore.getState();
    store.addElement(makeTextEl());
    const elements = usePosterStore.getState().elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toMatch(/^el_/);
    expect(elements[0].zIndex).toBe(1);
    expect((elements[0] as PosterTextElement).text).toBe('Hello');
  });

  it('selects the newly added element', () => {
    usePosterStore.getState().addElement(makeTextEl());
    const { selectedIds, elements } = usePosterStore.getState();
    expect(selectedIds).toEqual([elements[0].id]);
  });

  it('assigns incrementing zIndex values', () => {
    const store = usePosterStore.getState();
    store.addElement(makeTextEl({ text: 'First' }));
    store.addElement(makeTextEl({ text: 'Second' }));
    const elements = usePosterStore.getState().elements;
    expect(elements[1].zIndex).toBeGreaterThan(elements[0].zIndex);
  });
});

describe('addElementToBack', () => {
  it('adds a selected element below every existing layer', () => {
    usePosterStore.getState().addElement(makeTextEl({ text: 'Foreground' }));
    usePosterStore.getState().addElementToBack({
      type: 'image',
      src: '/api/poster-backgrounds/bg-1/file',
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
      locked: true,
    });

    const state = usePosterStore.getState();
    const background = state.elements.find((element) => element.type === 'image');
    const foreground = state.elements.find((element) => element.type === 'text');
    expect(background?.zIndex).toBeLessThan(foreground?.zIndex ?? 0);
    expect(state.selectedIds).toEqual([background?.id]);
  });
});

describe('updateElement', () => {
  it('updates properties of an existing element', () => {
    usePosterStore.getState().addElement(makeTextEl());
    const id = usePosterStore.getState().elements[0].id;
    usePosterStore.getState().updateElement(id, { left: 200 });
    expect(usePosterStore.getState().elements[0].left).toBe(200);
  });

  it('does not affect other elements', () => {
    const store = usePosterStore.getState();
    store.addElement(makeTextEl({ text: 'A' }));
    store.addElement(makeTextEl({ text: 'B' }));
    const els = usePosterStore.getState().elements;
    usePosterStore.getState().updateElement(els[0].id, { left: 999 });
    expect(usePosterStore.getState().elements[1].left).toBe(100);
  });
});

describe('removeElements', () => {
  it('removes elements by id', () => {
    const store = usePosterStore.getState();
    store.addElement(makeTextEl({ text: 'A' }));
    store.addElement(makeTextEl({ text: 'B' }));
    const id = usePosterStore.getState().elements[0].id;
    usePosterStore.getState().removeElements([id]);
    const remaining = usePosterStore.getState().elements;
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as PosterTextElement).text).toBe('B');
  });

  it('clears selection for removed elements', () => {
    usePosterStore.getState().addElement(makeTextEl());
    const id = usePosterStore.getState().elements[0].id;
    usePosterStore.getState().setSelected([id]);
    usePosterStore.getState().removeElements([id]);
    expect(usePosterStore.getState().selectedIds).toEqual([]);
  });
});

describe('duplicateElements', () => {
  it('creates a copy with offset and new id', () => {
    usePosterStore.getState().addElement(makeTextEl({ left: 50, top: 80 }));
    const id = usePosterStore.getState().elements[0].id;
    usePosterStore.getState().duplicateElements([id]);
    const elements = usePosterStore.getState().elements;
    expect(elements).toHaveLength(2);
    expect(elements[1].id).not.toBe(id);
    expect(elements[1].left).toBe(70);
    expect(elements[1].top).toBe(100);
  });
});

describe('undo / redo', () => {
  // The store pushes history BEFORE each mutation (capturing the pre-state).
  // The latest state is only recorded when the next action calls pushHistory.
  // In tests we call pushHistory() after the last mutation to flush it.

  it('undo reverts to previous state', () => {
    usePosterStore.getState().addElement(makeTextEl({ text: 'First' }));
    usePosterStore.getState().addElement(makeTextEl({ text: 'Second' }));
    usePosterStore.getState().pushHistory();
    expect(usePosterStore.getState().elements).toHaveLength(2);
    usePosterStore.getState().undo();
    expect(usePosterStore.getState().elements).toHaveLength(1);
    expect((usePosterStore.getState().elements[0] as PosterTextElement).text).toBe('First');
  });

  it('redo re-applies undone state', () => {
    usePosterStore.getState().addElement(makeTextEl({ text: 'First' }));
    usePosterStore.getState().addElement(makeTextEl({ text: 'Second' }));
    usePosterStore.getState().pushHistory();
    usePosterStore.getState().undo();
    expect(usePosterStore.getState().elements).toHaveLength(1);
    usePosterStore.getState().redo();
    expect(usePosterStore.getState().elements).toHaveLength(2);
  });

  it('undo at the start is a no-op', () => {
    usePosterStore.getState().undo();
    expect(usePosterStore.getState().elements).toEqual([]);
  });

  it('redo at the end is a no-op', () => {
    usePosterStore.getState().addElement(makeTextEl());
    usePosterStore.getState().pushHistory();
    usePosterStore.getState().redo();
    expect(usePosterStore.getState().elements).toHaveLength(1);
  });

  it('multiple undos walk back through history', () => {
    usePosterStore.getState().addElement(makeTextEl({ text: 'A' }));
    usePosterStore.getState().addElement(makeTextEl({ text: 'B' }));
    usePosterStore.getState().addElement(makeTextEl({ text: 'C' }));
    usePosterStore.getState().pushHistory();
    expect(usePosterStore.getState().elements).toHaveLength(3);
    usePosterStore.getState().undo();
    expect(usePosterStore.getState().elements).toHaveLength(2);
    usePosterStore.getState().undo();
    expect(usePosterStore.getState().elements).toHaveLength(1);
  });
});

describe('setCanvasSize', () => {
  it('updates width and height', () => {
    usePosterStore.getState().setCanvasSize(1920, 1080);
    const { canvasWidth, canvasHeight } = usePosterStore.getState();
    expect(canvasWidth).toBe(1920);
    expect(canvasHeight).toBe(1080);
  });

  it('bumps fitCenterNonce', () => {
    const before = usePosterStore.getState().fitCenterNonce;
    usePosterStore.getState().setCanvasSize(1920, 1080);
    expect(usePosterStore.getState().fitCenterNonce).toBe(before + 1);
  });
});

describe('setCanvasZoom', () => {
  it('clamps zoom between 0.1 and 5', () => {
    usePosterStore.getState().setCanvasZoom(0.01);
    expect(usePosterStore.getState().canvasZoom).toBe(0.1);
    usePosterStore.getState().setCanvasZoom(10);
    expect(usePosterStore.getState().canvasZoom).toBe(5);
  });
});

describe('setCanvasBackground', () => {
  it('accepts a solid background', () => {
    usePosterStore.getState().setCanvasBackground({ type: 'solid', color: '#ff0000' });
    expect(usePosterStore.getState().canvasBackground).toEqual({ type: 'solid', color: '#ff0000' });
  });
});

describe('loadProject', () => {
  it('loads elements, dimensions, and resets history', () => {
    const project = {
      elements: [
        { id: 'x1', type: 'text', text: 'Loaded', left: 10, top: 10, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, fontSize: 16, fontFamily: 'Arial', fill: '#000', zIndex: 1 },
      ],
      canvasWidth: 500,
      canvasHeight: 400,
      canvasBackground: { type: 'solid' as const, color: '#cccccc' },
    };
    usePosterStore.getState().loadProject(project as any);
    const state = usePosterStore.getState();
    expect(state.elements).toHaveLength(1);
    expect(state.canvasWidth).toBe(500);
    expect(state.canvasHeight).toBe(400);
    expect(state.historyIndex).toBe(0);
    expect(state.canvasZoom).toBe(1);
  });

  it('filters out freehand elements', () => {
    const project = {
      elements: [
        { id: 'x1', type: 'text', text: 'Keep', left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, fontSize: 16, fontFamily: 'Arial', fill: '#000', zIndex: 1 },
        { id: 'x2', type: 'freehand', left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 2 },
      ],
      canvasWidth: 800,
      canvasHeight: 600,
    };
    usePosterStore.getState().loadProject(project as any);
    expect(usePosterStore.getState().elements).toHaveLength(1);
  });
});

describe('getProject', () => {
  it('returns current project state', () => {
    usePosterStore.getState().addElement(makeTextEl());
    const project = usePosterStore.getState().getProject();
    expect(project.elements).toHaveLength(1);
    expect(project.canvasWidth).toBe(800);
    expect(project.canvasHeight).toBe(600);
    expect(project.canvasBackground).toBeDefined();
  });
});

describe('z-ordering', () => {
  function addThree() {
    const store = usePosterStore.getState();
    store.addElement(makeTextEl({ text: 'A' }));
    store.addElement(makeTextEl({ text: 'B' }));
    store.addElement(makeTextEl({ text: 'C' }));
    return usePosterStore.getState().elements;
  }

  it('bringToFront moves element to highest zIndex', () => {
    const els = addThree();
    usePosterStore.getState().bringToFront([els[0].id]);
    const updated = usePosterStore.getState().elements;
    const first = updated.find((e) => e.id === els[0].id)!;
    const maxZ = Math.max(...updated.map((e) => e.zIndex));
    expect(first.zIndex).toBe(maxZ);
  });

  it('sendToBack moves element to lowest zIndex', () => {
    const els = addThree();
    usePosterStore.getState().sendToBack([els[2].id]);
    const updated = usePosterStore.getState().elements;
    const last = updated.find((e) => e.id === els[2].id)!;
    const minZ = Math.min(...updated.map((e) => e.zIndex));
    expect(last.zIndex).toBe(minZ);
  });
});
