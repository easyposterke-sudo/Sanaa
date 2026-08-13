import { describe, it, expect, beforeEach } from 'vitest';
import { usePosterStore } from '../store/posterStore';

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

describe('Multi-island path conversion', () => {
  it('merges multiple islands into a single path element with evenodd fill rule', async () => {
    // Setup marquee state with two islands
    usePosterStore.setState({
      marqueeLocalPath: [
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 75, y: 75 }, { x: 25, y: 75 }]
      ],
      marqueeTargetId: 'target-1',
      elements: [{ id: 'target-1', type: 'image', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1, src: '' }]
    });

    await usePosterStore.getState().confirmSelectionAsVector();

    const elements = usePosterStore.getState().elements;
    // target-1 + 1 merged path
    expect(elements).toHaveLength(2);

    const pathEl = elements.find(e => e.type === 'path') as any;
    expect(pathEl).toBeDefined();
    expect(pathEl.pathPoints).toHaveLength(4);
    expect(pathEl.islands).toHaveLength(1);
    expect(pathEl.islands[0]).toHaveLength(4);
    expect(pathEl.fillRule).toBe('evenodd');
  });
});
