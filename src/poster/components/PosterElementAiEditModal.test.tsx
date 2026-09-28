import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PosterElementAiEditModal } from './PosterElementAiEditModal';
import { usePosterStore } from '../store/posterStore';
import { requestPosterElementEdit } from '../services/posterElementEditApi';
import { renderReferenceDraft } from '../ai/renderReferenceDraft';
import { cropElementEditDetail } from '../ai/elementEditPreview';
import { referenceElement, referencePlan } from '../ai/referenceTestFixtures';
import type { PosterElement } from '../types';

vi.mock('../services/posterElementEditApi', () => ({ requestPosterElementEdit: vi.fn() }));
vi.mock('../ai/renderReferenceDraft', () => ({ renderReferenceDraft: vi.fn() }));
vi.mock('../ai/elementEditPreview', async original => ({ ...await original<typeof import('../ai/elementEditPreview')>(), cropElementEditDetail: vi.fn() }));
vi.mock('../ai/prepareReconstructionFontCatalog', () => ({ prepareReconstructionFontCatalog: vi.fn() }));

const reference = { dataUrl: 'data:image/webp;base64,AAAA', originalDataUrl: 'original-full-resolution', width: 1000, height: 1000 };
const selected: PosterElement = { id: 'selected', type: 'path', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 2, fill: '#ffffff', closed: true, pathPoints: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 300, y: 200 }] };
const other: PosterElement = { id: 'other', type: 'rect', left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1, width: 1000, height: 1000, fill: '#111111' };

beforeEach(() => {
  usePosterStore.getState().loadProject({ elements: [other, selected], canvasWidth: 1000, canvasHeight: 1000 }, { aiReference: reference });
  const surface = document.createElement('canvas');
  surface.width = surface.height = 1000;
  vi.spyOn(surface, 'toDataURL').mockReturnValue('data:image/png;base64,BBBB');
  vi.mocked(renderReferenceDraft).mockResolvedValue(surface);
  vi.mocked(cropElementEditDetail).mockResolvedValue('data:image/webp;base64,CCCC');
  vi.mocked(requestPosterElementEdit).mockResolvedValue({ patch: referencePlan([referenceElement({ kind: 'path', pathUsage: 'closed_fill', pathClosed: true, pathPoints: [{ x: 0, y: 0, smooth: false }, { x: 1, y: 0, smooth: false }, { x: .8, y: 1, smooth: false }] })]), model: 'test', requestId: 'test' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

it('previews the correction without changing the poster, applies just the selection, and supports undo', async () => {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  const before = usePosterStore.getState().elements;
  render(<PosterElementAiEditModal selectedId="selected" onClose={onClose} onApplied={onApplied} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview AI edit' }));
  const apply = await screen.findByRole('button', { name: 'Apply this edit' });
  expect(usePosterStore.getState().elements).toBe(before);
  expect(screen.getAllByRole('img')).toHaveLength(3);
  expect(cropElementEditDetail).toHaveBeenCalledWith('original-full-resolution', expect.any(Object));
  expect(requestPosterElementEdit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ referenceDataUrl: 'data:image/webp;base64,CCCC' }) }), expect.any(Object));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(apply);
  expect(usePosterStore.getState().elements[0]).toBe(before[0]);
  expect(usePosterStore.getState().elements[1]).not.toBe(before[1]);
  expect(usePosterStore.getState().elements[1]!.id).toBe('selected');
  expect(onApplied).toHaveBeenCalledWith(['selected']);
  expect(onClose).toHaveBeenCalledOnce();
  act(() => usePosterStore.getState().undo());
  expect(usePosterStore.getState().elements).toEqual(before);
});

it('keeps the existing layer when a preview is cancelled', async () => {
  const before = usePosterStore.getState().elements;
  const close = vi.fn();
  render(<PosterElementAiEditModal selectedId="selected" onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview AI edit' }));
  await screen.findByRole('button', { name: 'Apply this edit' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
  expect(usePosterStore.getState().elements).toBe(before);
});

it('does not let an old preview overwrite a newer change', async () => {
  render(<PosterElementAiEditModal selectedId="selected" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview AI edit' }));
  const apply = await screen.findByRole('button', { name: 'Apply this edit' });
  const newer = usePosterStore.getState().elements.map(item => item.id === 'other' ? { ...item, left: 77 } : item);
  act(() => usePosterStore.setState({ elements: newer }));
  fireEvent.click(apply);
  expect(screen.getByRole('alert')).toHaveTextContent('poster changed');
  expect(usePosterStore.getState().elements).toBe(newer);
});

it('discards a result when the poster changes while the request is pending', async () => {
  const response = vi.mocked(requestPosterElementEdit).getMockImplementation()!;
  let finish!: (value: Awaited<ReturnType<typeof requestPosterElementEdit>>) => void;
  vi.mocked(requestPosterElementEdit).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<PosterElementAiEditModal selectedId="selected" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview AI edit' }));
  await vi.waitFor(() => expect(requestPosterElementEdit).toHaveBeenCalledOnce());
  const newer = [...usePosterStore.getState().elements];
  act(() => usePosterStore.setState({ elements: newer }));
  const args = vi.mocked(requestPosterElementEdit).mock.calls[0]!;
  await act(async () => finish(await response(...args)));
  expect(await screen.findByRole('alert')).toHaveTextContent('poster changed');
  expect(screen.queryByRole('button', { name: 'Apply this edit' })).toBeNull();
  expect(usePosterStore.getState().elements).toBe(newer);
});
