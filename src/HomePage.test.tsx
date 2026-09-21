import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';
import { useAuthStore } from './auth/authStore';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
  window.history.replaceState({}, '', '#/');
});

describe('homepage', () => {
  it('promotes only the reference-to-editable-poster creation flow', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /see a poster you love/i })).toBeInTheDocument();
    expect(screen.queryByText('Browse Templates')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /create from a reference/i }));
    expect(window.location.hash).toBe('#/poster');
    expect(window.history.state.__easyposterRouterState).toEqual({ openReferenceCreator: true });
  });

  it('keeps the reference flow after opening sign up', () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole('link', { name: 'Sign up free' }));
    expect(window.location.hash).toBe('#/signup');
    expect(window.history.state.__easyposterRouterState.from).toEqual({
      pathname: '/poster', state: { openReferenceCreator: true },
    });
  });
});
