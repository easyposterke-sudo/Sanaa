import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PosterPromptCreator } from './PosterPromptCreator';
import { createFallbackReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import { compilePosterReconstruction } from '../ai/compilePosterReconstruction';
import { capturePosterThumbnail, getFabricCanvasRef } from '../canvasRef';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';

vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('../ai/compilePosterReconstruction', () => ({ compilePosterReconstruction: vi.fn() }));
vi.mock('../canvasRef', () => ({ capturePosterThumbnail: vi.fn(), getFabricCanvasRef: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('prompt creator form', () => {
  it('retries a review that drops Host and retains the valid draft until repair succeeds', async () => {
    const plan = createFallbackReconstructionPlan();
    const text = plan.elements.find(element => element.kind === 'text')!;
    plan.elements = [{ ...text, key: 'role', kind: 'text', imageRole: 'none', box: {x:.1,y:.1,width:.3,height:.1}, text: 'Host', opacity: 1, fill: '#ffffff' }];
    const invalid = { ...plan, elements: [{ ...plan.elements[0], text: 'Guest' }] };
    const compiled = { project: { canvasWidth: 1080, canvasHeight: 1350, elements: [{ id: 'role', type: 'text', text: 'Host', fontSize: 30, fontFamily: 'Arial', fill: '#ffffff', left: 100, top: 100, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, zIndex: 1 }] }, warnings: [], description: 'Ready', fieldBindings: [], suggestedTemplateName: 'Test', category: 'church_ministry' };
    vi.mocked(compilePosterReconstruction).mockResolvedValue(compiled as Awaited<ReturnType<typeof compilePosterReconstruction>>);
    vi.mocked(capturePosterThumbnail).mockResolvedValue('data:image/png;base64,AAAA');
    vi.mocked(getFabricCanvasRef).mockReturnValue({ getObjects: () => [{ data: { posterId: 'role' }, text: 'Host' }], renderAll: vi.fn() } as unknown as ReturnType<typeof getFabricCanvasRef>);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    const response = { plan } as Awaited<ReturnType<typeof requestPosterReconstruction>>;
    vi.mocked(requestPosterReconstruction).mockResolvedValueOnce(response).mockResolvedValueOnce({ ...response, plan: invalid }).mockResolvedValueOnce(response);
    const onApply = vi.fn();
    render(<PosterPromptCreator onApply={onApply} onClose={vi.fn()} onImport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Speaker 1 role'), { target: { value: 'Host' } });
    fireEvent.change(screen.getByLabelText('Describe your church service poster'), { target: { value: 'A church service poster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate editable poster' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Your editable draft is ready.'), { timeout: 10000 });
    expect(requestPosterReconstruction).toHaveBeenCalledTimes(3);
    expect(vi.mocked(requestPosterReconstruction).mock.calls[2][0].creation?.repairFeedback).toContain('Include speaker detail as visible text: Host');
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(compilePosterReconstruction).toHaveBeenCalledTimes(2);
  }, 15000);


  it('passes each failed manifest into bounded repairs without extending a full brief', async () => {
    const plan = createFallbackReconstructionPlan();
    plan.elements = [];
    const response = { plan } as Awaited<ReturnType<typeof requestPosterReconstruction>>;
    vi.mocked(requestPosterReconstruction).mockResolvedValue(response);
    const onApply = vi.fn();
    render(<PosterPromptCreator onApply={onApply} onClose={vi.fn()} onImport={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Speaker 1 role'), { target: { value: 'Host' } });
    const brief = 'A church poster ' + 'a'.repeat(3984);
    fireEvent.change(screen.getByLabelText('Describe your church service poster'), { target: { value: brief } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate editable poster' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('three automatic corrections'));
    expect(requestPosterReconstruction).toHaveBeenCalledTimes(4);
    for (const [request] of vi.mocked(requestPosterReconstruction).mock.calls.slice(1)) {
      expect(request.creation?.previousPlan).toEqual(plan);
      expect(request.creation?.prompt).toBe(brief);
      expect(request.creation?.repairFeedback).toContain('Include speaker detail as visible text: Host');
    }
    expect(screen.getByRole('alert')).not.toHaveTextContent('Include speaker detail');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(onApply).not.toHaveBeenCalled();
  });

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
    }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate editable poster' })).toBeEnabled();
  });
});
