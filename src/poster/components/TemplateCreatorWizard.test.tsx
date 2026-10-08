import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplateCreatorWizard } from './TemplateCreatorWizard';
import { compilePosterReconstruction, type CompiledPosterReconstruction } from '../ai/compilePosterReconstruction';
import { reviewReferenceDraft } from '../ai/reviewReferenceDraft';
import { referenceElement, referencePlan } from '../ai/referenceTestFixtures';
import { createFallbackReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import type { PosterReconstructionResponse } from '../../../shared/ai/posterReconstruction';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';
import { prepareReconstructionFontCatalog } from '../ai/prepareReconstructionFontCatalog';
import { searchStockPhotos } from '../services/stockPhotosApi';

vi.mock('../ai/compilePosterReconstruction', () => ({ compilePosterReconstruction: vi.fn() }));
vi.mock('../ai/reviewReferenceDraft', () => ({ reviewReferenceDraft: vi.fn() }));
vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('../ai/prepareReconstructionFontCatalog', () => ({ prepareReconstructionFontCatalog: vi.fn() }));
vi.mock('../services/stockPhotosApi', () => ({ searchStockPhotos: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('recreates a viewed poster with a fresh AI request each time', async () => {
  vi.mocked(prepareReconstructionFontCatalog).mockResolvedValue({ request: { entries: [], previewDataUrls: [] }, families: {} });
  vi.mocked(searchStockPhotos).mockResolvedValue([]);
  vi.mocked(requestPosterReconstruction).mockResolvedValue({
    plan: createFallbackReconstructionPlan(), source: 'openai', model: 'test', requestId: 'test',
  });
  render(<TemplateCreatorWizard
    open
    mode="poster"
    referenceOnly
    initialReference={{ dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 800, height: 1000, sourceWidth: 800, sourceHeight: 1000, fileName: 'original.png' }}
    initialCanvasSize={{ id: 'original', width: 1080, height: 1350 }}
    onClose={vi.fn()}
    onApply={vi.fn()}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Analyze and create editable draft' }));
  await waitFor(() => expect(requestPosterReconstruction).toHaveBeenCalledTimes(1));
  expect(vi.mocked(requestPosterReconstruction).mock.calls[0][0]).toMatchObject({ forceFresh: true });

  fireEvent.click(await screen.findByRole('button', { name: 'Recreate again from scratch' }));
  await waitFor(() => expect(requestPosterReconstruction).toHaveBeenCalledTimes(2));
  expect(vi.mocked(requestPosterReconstruction).mock.calls[1][0]).toMatchObject({ forceFresh: true });
});

it('shows truthful progress while the reference analysis is pending', async () => {
  vi.mocked(prepareReconstructionFontCatalog).mockResolvedValue({ request: { entries: [], previewDataUrls: [] }, families: {} });
  vi.mocked(searchStockPhotos).mockResolvedValue([]);
  let finishAnalysis!: (result: PosterReconstructionResponse) => void;
  vi.mocked(requestPosterReconstruction).mockReturnValue(new Promise((resolve) => { finishAnalysis = resolve; }));
  render(<TemplateCreatorWizard
    open
    mode="poster"
    referenceOnly
    initialReference={{ dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 800, height: 1000, sourceWidth: 800, sourceHeight: 1000, fileName: 'original.png' }}
    initialCanvasSize={{ id: 'original', width: 1080, height: 1350 }}
    onClose={vi.fn()}
    onApply={vi.fn()}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Analyze and create editable draft' }));
  await waitFor(() => expect(requestPosterReconstruction).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Reconstructing editable layers')).toBeTruthy();
  expect(screen.getByText(/Time left in the analysis window: up to 6:00/)).toBeTruthy();
  expect(screen.queryByText(/% complete/)).toBeNull();

  await act(async () => finishAnalysis({
    plan: createFallbackReconstructionPlan(), source: 'openai', model: 'test', requestId: 'test',
  }));
  expect(screen.queryByText('Reconstructing editable layers')).toBeNull();
});


it.each([false, true])('only runs the additional paid reference review when selected: %s', async enableReview => {
  const draft: CompiledPosterReconstruction = { project: { canvasWidth: 800, canvasHeight: 1000, elements: [] }, fieldBindings: [], suggestedTemplateName: 'Test', category: 'general', description: 'Fixture', warnings: [] };
  vi.mocked(prepareReconstructionFontCatalog).mockResolvedValue({ request: { entries: [], previewDataUrls: [] }, families: {} });
  vi.mocked(searchStockPhotos).mockResolvedValue([]);
  vi.mocked(requestPosterReconstruction).mockResolvedValue({
    plan: referencePlan([referenceElement({ kind: 'text', textEffect: 'flat' })]), source: 'openai', model: 'test', requestId: 'test',
  });
  vi.mocked(compilePosterReconstruction).mockResolvedValue(draft);
  vi.mocked(reviewReferenceDraft).mockResolvedValue(draft);
  const onApply = vi.fn();
  render(<TemplateCreatorWizard open mode="poster" referenceOnly
    initialReference={{ dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 800, height: 1000, sourceWidth: 800, sourceHeight: 1000, fileName: 'original.png' }}
    initialCanvasSize={{ id: 'original', width: 1080, height: 1350 }} onClose={vi.fn()} onApply={onApply} />);
  expect(screen.getByText(/Reference reconstruction: up to 22/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze and create editable draft' }));
  const review = await screen.findByRole('checkbox', { name: /Optional AI review.*costs extra/ });
  expect(review).not.toBeChecked();
  if (enableReview) fireEvent.click(review);
  fireEvent.click(screen.getByRole('button', { name: 'Create draft with these replacements' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, { source: 'openai', model: 'test' }));
  expect(requestPosterReconstruction).toHaveBeenCalledTimes(1);
  expect(compilePosterReconstruction).toHaveBeenCalledTimes(1);
  expect(reviewReferenceDraft).toHaveBeenCalledTimes(enableReview ? 1 : 0);
});
