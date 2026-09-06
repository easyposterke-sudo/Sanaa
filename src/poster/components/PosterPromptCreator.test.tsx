import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PosterPromptCreator } from './PosterPromptCreator';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';

vi.mock('../services/posterReconstructionApi', () => ({ requestPosterReconstruction: vi.fn() }));
vi.mock('../canvasRef', () => ({ capturePosterThumbnail: vi.fn(), getFabricCanvasRef: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('prompt creator form', () => {
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
    fireEvent.change(screen.getByLabelText('Describe your Sunday service poster'), { target: { value: 'Hope Church. Every Sunday at 9 AM. Elegant blue typography.' } });
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
