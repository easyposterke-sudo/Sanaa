import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import { usePosterStore } from '../store/posterStore';
import type { Poster3DTextElement } from '../types';
import { Poster3DPreviewRenderer } from './Poster3DPreviewRenderer';

vi.mock('../../components/canvas/Canvas', () => ({
  Canvas: () => <div data-testid="automatic-webgl-canvas" />,
}));

vi.mock('../loadPosterFonts', () => ({
  loadFontsForPosterElements: vi.fn(async () => undefined),
}));

vi.mock('../threeTextHandoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../threeTextHandoff')>();
  return {
    ...actual,
    trimTransparentRaster: vi.fn(async () => ({
      dataUrl: 'data:image/webp;base64,shiny',
      width: 1000,
      height: 250,
    })),
  };
});

function reconstructed3DTitle(): Poster3DTextElement {
  return {
    id: 'ai-3d-title',
    type: '3d-text',
    image: 'data:image/svg+xml;charset=utf-8,placeholder',
    config: {
      text: {
        content: 'KIDDY CONNECT TUESDAY',
        fontFamily: 'Times New Roman, serif',
        fontSize: 120,
        fontWeight: '700',
      },
      renderEngine: 'webgl',
    },
    previewWidth: 600,
    previewHeight: 200,
    left: 40,
    top: 30,
    scaleX: 0.5,
    scaleY: 0.5,
    angle: 0,
    opacity: 1,
    zIndex: 2,
  };
}

describe('Poster3DPreviewRenderer', () => {
  afterEach(() => {
    usePosterStore.setState({ elements: [] });
    useEditorStore.getState().setWebGLExportAPI(null);
  });

  it('automatically replaces an AI SVG placeholder with the real WebGL export', async () => {
    usePosterStore.setState({ elements: [reconstructed3DTitle()] });
    const onRendered = vi.fn();
    render(<Poster3DPreviewRenderer elementIds={['ai-3d-title']} onRendered={onRendered} />);

    await screen.findByTestId('automatic-webgl-canvas');
    await act(async () => {
      useEditorStore.getState().setWebGLExportAPI({
        toDataURL: () => 'data:image/webp;base64,raw-webgl',
        getCameraPose: () => ({
          position: { x: 0, y: 0, z: 8 },
          target: { x: 0, y: 0, z: 0 },
          fov: 45,
          zoom: 1,
        }),
        getCameraEvidence: () => ({
          projection: 'perspective',
          position: [0, 0, 8],
          target: [0, 0, 0],
          up: [0, 1, 0],
          fov: 45,
          near: 0.1,
          far: 1000,
          zoom: 1,
          viewport: { width: 800, height: 400, pixelRatio: 1 },
          toneMapping: 'ACESFilmicToneMapping',
          exposure: 1.2,
        }),
        whenContentReady: async () => undefined,
      });
    });

    await waitFor(() => {
      const title = usePosterStore.getState().elements[0] as Poster3DTextElement;
      expect(title.image).toBe('data:image/webp;base64,shiny');
      expect(title.scaleX).toBe(title.scaleY);
      expect(title.previewWidth).toBe(1000);
      expect(title.previewHeight).toBe(250);
    });
    expect(onRendered).toHaveBeenCalledWith('ai-3d-title');
  });
});
