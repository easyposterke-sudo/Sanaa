import { describe, it, expect, beforeEach } from 'vitest';
import { usePosterStore } from './posterStore';

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
    marqueeLocalPath: null,
    marqueeTargetId: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe('confirmSelectionAsVector', () => {
  it('adds path elements with default stroke and strokeWidth', async () => {
    const store = usePosterStore.getState();

    // Setup marquee state
    usePosterStore.setState({
      marqueeLocalPath: [[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]],
      marqueeTargetId: 'target-1',
      elements: [{ id: 'target-1', type: 'image', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1, src: '' }]
    });

    await usePosterStore.getState().confirmSelectionAsVector();

    const elements = usePosterStore.getState().elements;
    // target-1 + new path
    expect(elements).toHaveLength(2);

    const pathEl = elements.find(e => e.type === 'path');
    expect(pathEl).toBeDefined();
    expect(pathEl).toMatchObject({
      stroke: '#0f172a',
      strokeWidth: 0,
    });
  });
});
