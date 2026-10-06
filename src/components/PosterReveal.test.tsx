import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosterReveal } from './PosterReveal';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('poster reveal', () => {
  it('lets the visitor take control of the divider and stops autoplay', () => {
    render(<PosterReveal />);
    const slider = screen.getByRole('slider', { name: 'Reveal editable poster layers' });
    fireEvent.change(slider, { target: { value: '83' } });
    expect(slider).toHaveAttribute('aria-valuetext', '83% editable layers revealed');
    expect(screen.getByRole('button', { name: 'Play poster animation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play poster animation' }));
    expect(screen.getByRole('button', { name: 'Pause poster animation' })).toBeInTheDocument();
  });

  it('starts paused for visitors who prefer reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<PosterReveal />);
    expect(screen.getByRole('button', { name: 'Play poster animation' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('50');
  });
});
