import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PosterPromptCreator } from './PosterPromptCreator';
import { createFallbackReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import { compilePosterReconstruction } from '../ai/compilePosterReconstruction';
import { prepareCreationAsset } from '../ai/preparePosterImage';
import { capturePosterThumbnail, getFabricCanvasRef } from '../canvasRef';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';

vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('../ai/compilePosterReconstruction', () => ({ compilePosterReconstruction: vi.fn() }));
vi.mock('../ai/preparePosterImage', () => ({ prepareCreationAsset: vi.fn() }));
vi.mock('../canvasRef', () => ({ capturePosterThumbnail: vi.fn(), getFabricCanvasRef: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('prompt creator form', () => {
  it.each(['valid', 'missing-role', 'timeout'] as const)('uses at most two calls and keeps the first draft for %s review', async outcome => {
    const plan = createFallbackReconstructionPlan();
    const text = plan.elements.find(element => element.kind === 'text')!;
    plan.elements = [{ ...text, key: 'role', kind: 'text', imageRole: 'none', box: {x:.1,y:.1,width:.3,height:.1}, text: 'Host', opacity: 1, fill: '#ffffff' }];
    const invalid = { ...plan, elements: [{ ...plan.elements[0], text: 'Guest' }] };
    const compiled = { project: { canvasWidth: 1080, canvasHeight: 1350, elements: [{ id: 'role', type: 'text', text: 'Host', fontSize: 30, fontFamily: 'Arial', fill: '#ffffff', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1 }] }, warnings: [], description: 'Ready', fieldBindings: [], suggestedTemplateName: 'Test', category: 'church' };
    vi.mocked(compilePosterReconstruction).mockResolvedValue(compiled as Awaited<ReturnType<typeof compilePosterReconstruction>>);
    vi.mocked(capturePosterThumbnail).mockResolvedValue('data:image/png;base64,AAAA');
    vi.mocked(getFabricCanvasRef).mockReturnValue({ getObjects: () => [{ data: { posterId: 'role' }, text: 'Host' }], renderAll: vi.fn() } as unknown as ReturnType<typeof getFabricCanvasRef>);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    const response = { plan } as Awaited<ReturnType<typeof requestPosterReconstruction>>;
    vi.mocked(requestPosterReconstruction).mockResolvedValueOnce(response);
    if (outcome === 'timeout') vi.mocked(requestPosterReconstruction).mockRejectedValueOnce(new Error('timeout'));
    else vi.mocked(requestPosterReconstruction).mockResolvedValueOnce({ ...response, plan: outcome === 'valid' ? plan : invalid });
    const onApply = vi.fn();
    render(<PosterPromptCreator onApply={onApply} onClose={vi.fn()} onImport={vi.fn()} />);
    if (outcome === 'valid') {
      vi.mocked(prepareCreationAsset).mockResolvedValue({dataUrl:'data:image/webp;base64,RlVMTElNQUdF',analysisDataUrl:'data:image/webp;base64,U01BTExQUkVWSUVX',width:1536,height:1024,sourceWidth:3000,sourceHeight:2000,fileName:'background.webp'});
      fireEvent.change(screen.getByLabelText('background_photo'), {target:{files:[new File(['photo'],'background.webp',{type:'image/webp'})]}});
      await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent('Preparing image'));
    }
    fireEvent.change(screen.getByLabelText('Speaker 1 role'), { target: { value: 'Host' } });
    const brief = 'A church poster ' + 'a'.repeat(3984);
    fireEvent.change(screen.getByLabelText('Describe your church service poster'), { target: { value: brief } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate editable poster' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(outcome === 'valid' ? 'Your editable poster is ready.' : 'Automatic processing has stopped.'), { timeout: 10000 });
    expect(requestPosterReconstruction).toHaveBeenCalledTimes(2);
    const review = vi.mocked(requestPosterReconstruction).mock.calls[1][0].creation;
    expect(review).toMatchObject({ phase: 'review', responseMode: 'patch', prompt: brief });
    expect(review?.timeoutMs).toBeLessThanOrEqual(90000);
    if (outcome === 'valid') {
      expect(vi.mocked(requestPosterReconstruction).mock.calls[0][0].creation?.assets[0].dataUrl).toBe('data:image/webp;base64,U01BTExQUkVWSUVX');
      expect(review?.assets[0].dataUrl).toBeUndefined();
      expect(vi.mocked(compilePosterReconstruction).mock.calls[0][0].imageReplacements?.asset_background_photo.src).toBe('data:image/webp;base64,RlVMTElNQUdF');
    }
    expect(onApply).toHaveBeenCalledTimes(outcome === 'valid' ? 2 : 1);
    if (outcome !== 'valid') expect(screen.getByText(/first draft has been kept/)).toBeInTheDocument();
  }, 15000);

  it('adds arbitrary speaker slots and preserves names and roles when removing another speaker', async () => {
    vi.mocked(requestPosterReconstruction).mockRejectedValue(new Error('test stop'));
    render(<PosterPromptCreator onApply={vi.fn()} onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getAllByLabelText(/Speaker \d+ name/)).toHaveLength(1);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Add speaker' }));
    expect(screen.getAllByLabelText(/Speaker \d+ name/)).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Speaker 3 name'), { target: { value: 'David Kituyi' } });
    fireEvent.change(screen.getByLabelText('Speaker 3 role'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove speaker 2' }));
    expect(screen.getByLabelText('Speaker 2 name')).toHaveValue('David Kituyi');
    fireEvent.change(screen.getByLabelText('Describe your church service poster'), { target: { value: 'Sunday service at Hope Church' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate editable poster' }));
    await waitFor(() => expect(requestPosterReconstruction).toHaveBeenCalled());
    expect(vi.mocked(requestPosterReconstruction).mock.calls[0][0].creation?.speakers).toEqual([
      expect.objectContaining({ name: 'David Kituyi', role: 'Host' }),
    ]);
  });

  it('requires a brief and preserves the existing import entry point', () => {
    const onImport = vi.fn();
    render(<PosterPromptCreator onApply={vi.fn()} onClose={vi.fn()} onImport={onImport} />);
    expect(screen.getByRole('button', { name: 'Generate editable poster' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recreate an existing poster instead' }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it('sends the brief and direction, and leaves the canvas untouched when the API is not configured', async () => {
    vi.mocked(requestPosterReconstruction).mockRejectedValue(new Error('Set OPENAI_API_KEY to generate a poster from a prompt.'));
    const onApply = vi.fn();
    render(<PosterPromptCreator onApply={onApply} onClose={vi.fn()} onImport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Describe your church service poster'), { target: { value: 'Hope Church. Every Sunday at 9 AM. Elegant blue typography.' } });
    fireEvent.change(screen.getByLabelText('Design direction'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate editable poster' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OPENAI_API_KEY'));
    expect(requestPosterReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      creation: expect.objectContaining({ referenceId: 6, phase: 'design', assets: [], prompt: expect.stringContaining('Hope Church') }),
    }), expect.objectContaining({ timeoutMs: expect.any(Number), signal: expect.any(AbortSignal) }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate editable poster' })).toBeEnabled();
  });
});
