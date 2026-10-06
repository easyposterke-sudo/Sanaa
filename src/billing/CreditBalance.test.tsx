import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditBalance } from './CreditBalance';
import { useAuthStore } from '../auth/authStore';
import { apiFetch } from '../lib/api';
import { notifyBillingUpdated } from './billingEvents';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
const user = { id: 'person-1', email: 'artist@example.com', role: 'user' as const };
const response = (amount: number, monthly = 0, active = false) => new Response(JSON.stringify({ balanceCredits: amount, monthly: { balanceCredits: monthly, active } }));

beforeEach(() => {
  useAuthStore.setState({ user });
  vi.mocked(apiFetch).mockReset().mockResolvedValue(response(40));
});
afterEach(() => { cleanup(); useAuthStore.setState({ user: null }); vi.useRealTimers(); });

describe('editor credit balance', () => {
  it('shows remaining credits and opens billing without leaving the editor', async () => {
    render(<CreditBalance />);
    const link = await screen.findByRole('link', { name: /40 credits remaining/ });
    expect(link).toHaveAttribute('href', '#/billing');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('counts active monthly credits and refreshes after AI work', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response(40, 100, true)).mockResolvedValue(response(40, 92.125, true));
    render(<CreditBalance />);
    expect(await screen.findByRole('link', { name: /140 credits remaining/ })).toHaveAttribute('title', expect.stringContaining('40 trial / pay-as-you-go + 100 monthly'));
    act(() => notifyBillingUpdated());
    expect(await screen.findByRole('link', { name: /132.125 credits remaining/ })).toBeInTheDocument();
  });

  it('excludes expired monthly credits and displays a real zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(0, 100, false));
    render(<CreditBalance />);
    expect(await screen.findByRole('link', { name: /0 credits remaining/ })).toBeInTheDocument();
  });

  it('does not present a stale balance as current after a refresh failure, and recovers', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response(40)).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response(30));
    render(<CreditBalance />);
    await screen.findByRole('link', { name: /40 credits remaining/ });
    act(() => notifyBillingUpdated());
    await screen.findByRole('link', { name: /Credits unavailable/ });
    act(() => window.dispatchEvent(new Event('focus')));
    await screen.findByRole('link', { name: /30 credits remaining/ });
  });

  it('does not fetch for signed-out users or leak the previous user balance', async () => {
    const { rerender } = render(<CreditBalance />);
    await screen.findByRole('link', { name: /40 credits remaining/ });
    vi.mocked(apiFetch).mockResolvedValue(response(12));
    act(() => useAuthStore.setState({ user: { ...user, id: 'person-2' } }));
    rerender(<CreditBalance />);
    expect(screen.queryByRole('link', { name: /40 credits remaining/ })).not.toBeInTheDocument();
    await screen.findByRole('link', { name: /12 credits remaining/ });
    act(() => useAuthStore.setState({ user: null }));
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument());
    vi.mocked(apiFetch).mockClear();
    act(() => notifyBillingUpdated());
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
