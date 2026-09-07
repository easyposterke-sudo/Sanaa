import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PosterPromptCreator } from './PosterPromptCreator';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';

vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('../canvasRef', () => ({ capturePosterThumbnail: vi.fn(), getFabricCanvasRef: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('prompt creator form', () => {
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
