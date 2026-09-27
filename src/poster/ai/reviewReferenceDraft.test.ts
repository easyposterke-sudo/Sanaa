import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewReferenceDraft } from './reviewReferenceDraft';
import { renderReferenceDraft } from './renderReferenceDraft';
import { loadReferencePixels } from './referenceComparison';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';
import { referenceElement, referencePlan } from './referenceTestFixtures';
import type { CompiledPosterReconstruction } from './compilePosterReconstruction';

vi.mock('./renderReferenceDraft', () => ({ renderReferenceDraft: vi.fn() }));
vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('./referenceComparison', async importOriginal => ({ ...await importOriginal<typeof import('./referenceComparison')>(), loadReferencePixels: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
const pixels = (value: number) => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(value) });
function surface(value: number) { return { width: 16, height: 16, getContext: () => ({ getImageData: () => pixels(value) }), toDataURL: () => 'data:image/webp;base64,AAAA' } as unknown as HTMLCanvasElement; }
function fixture() {
  const plan = referencePlan([referenceElement({ kind: 'text', text: 'SUNDAY' })]);
  const draft: CompiledPosterReconstruction = { project: { canvasWidth: 16, canvasHeight: 16, elements: [] }, fieldBindings: [], suggestedTemplateName: 'Test', category: 'general', description: 'Fixture', warnings: [] };
  const compile = vi.fn().mockResolvedValue({ ...draft, warnings: ['candidate'] });
  vi.mocked(loadReferencePixels).mockResolvedValue(pixels(255));
  vi.mocked(requestPosterReconstruction).mockResolvedValue({ plan, source: 'openai', model: 'test', requestId: 'test' });
  return { plan, draft, compile, reference: { dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 800, height: 1000 } };
}
describe('bounded reference review', () => {
  it('accepts only a measured improvement after one request', async () => {
    const input = fixture();
    vi.mocked(renderReferenceDraft).mockResolvedValueOnce(surface(50)).mockResolvedValueOnce(surface(255));
    const result = await reviewReferenceDraft(input);
    expect(result.warnings).toContain('candidate');
    expect(requestPosterReconstruction).toHaveBeenCalledTimes(1);
    expect(input.compile).toHaveBeenCalledTimes(1);
  });
  it('keeps the original project when the candidate renders worse', async () => {
    const input = fixture();
    vi.mocked(renderReferenceDraft).mockResolvedValueOnce(surface(200)).mockResolvedValueOnce(surface(0));
    const result = await reviewReferenceDraft(input);
    expect(result.project).toBe(input.draft.project);
    expect(result.warnings.join(' ')).toContain('first draft was kept');
  });
  it('keeps the original project on API failure and never retries automatically', async () => {
    const input = fixture(); vi.mocked(renderReferenceDraft).mockResolvedValue(surface(100));
    vi.mocked(requestPosterReconstruction).mockRejectedValue(new Error('Offline'));
    const result = await reviewReferenceDraft(input);
    expect(result.project).toBe(input.draft.project);
    expect(input.compile).not.toHaveBeenCalled();
    expect(requestPosterReconstruction).toHaveBeenCalledTimes(1);
  });
  it('rejects text changes before compiling the candidate', async () => {
    const input = fixture(); vi.mocked(renderReferenceDraft).mockResolvedValue(surface(100));
    vi.mocked(requestPosterReconstruction).mockResolvedValue({ plan: referencePlan([referenceElement({ kind: 'text', text: 'MONDAY' })]), source: 'openai', model: 'test', requestId: 'test' });
    const result = await reviewReferenceDraft(input);
    expect(result.project).toBe(input.draft.project);
    expect(input.compile).not.toHaveBeenCalled();
  });
  it('returns the first draft when rendering stalls and ignores late work', async () => {
    vi.useFakeTimers(); const input = fixture();
    vi.mocked(renderReferenceDraft).mockReturnValue(new Promise(() => undefined));
    const result = reviewReferenceDraft(input);
    await vi.advanceTimersByTimeAsync(120_001);
    expect((await result).project).toBe(input.draft.project);
    expect(requestPosterReconstruction).not.toHaveBeenCalled();
  });
  it('does not start a request if source decoding finishes after the overall timeout', async () => {
    vi.useFakeTimers(); const input = fixture();
    vi.mocked(renderReferenceDraft).mockResolvedValue(surface(100));
    let finishSource!: (value: ReturnType<typeof pixels>) => void;
    vi.mocked(loadReferencePixels).mockReturnValue(new Promise(resolve => { finishSource = resolve; }));
    const result = reviewReferenceDraft(input);
    await vi.advanceTimersByTimeAsync(120_001);
    expect((await result).project).toBe(input.draft.project);
    finishSource(pixels(255));
    await vi.advanceTimersByTimeAsync(0);
    expect(requestPosterReconstruction).not.toHaveBeenCalled();
    expect(input.compile).not.toHaveBeenCalled();
  });
});
