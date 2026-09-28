import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPage } from './BillingPage';
import { apiFetch } from '../lib/api';
import { BILLING } from '../../shared/billing';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
const balance = {
  balanceCredits: 40, spentCredits: 10, busy: false, plan: 'trial', trialUsedPercent: 20,
  monthly: { active: false, expiresAt: null, balanceCredits: 0, allowanceCredits: 500, usedPercent: 100 },
  recentUsage: [{ request_id: 'usage-1', credits: 10, created_at: '2026-09-28T10:00:00Z' }],
  pricing: BILLING, paymentsConfigured: true,
};

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/billing');
  vi.mocked(apiFetch).mockReset().mockResolvedValue(new Response(JSON.stringify(balance)));
});
afterEach(cleanup);

describe('BillingPage', () => {
  it('shows trial credits and percentage without token counts', async () => {
    render(<BillingPage />);
    expect(await screen.findByText('40 credits')).toBeInTheDocument();
    expect(screen.getByText('20.0% used')).toBeInTheDocument();
    expect(screen.getByText('10 credits')).toBeInTheDocument();
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
    expect(screen.getByText('KSh 20 adds 15.2 credits.')).toBeInTheDocument();
  });

  it('submits a custom M-Pesa top-up and prevents amounts below KSh 20', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => new Response(JSON.stringify(
      path === '/api/billing' ? balance : { error: 'Test checkout stopped' },
    ), { status: path === '/api/billing' ? 200 : 400 }));
    render(<BillingPage />);
    await screen.findByText('40 credits');
    fireEvent.change(screen.getByLabelText('M-Pesa phone number'), { target: { value: '0722000000' } });
    fireEvent.change(screen.getByLabelText('Top-up amount (KSh)'), { target: { value: '19' } });
    expect(screen.getByRole('button', { name: 'Send M-Pesa prompt' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Top-up amount (KSh)'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send M-Pesa prompt' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/billing/checkout', expect.objectContaining({
      body: JSON.stringify({ channel: 'mpesa', phone: '0722000000', kind: 'credits', amountKes: 75 }),
    })));
  });

  it('shows the monthly allowance and sends the monthly purchase kind', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => new Response(JSON.stringify(path === '/api/billing'
      ? { ...balance, plan: 'monthly', monthly: { active: true, expiresAt: '2026-10-28T10:00:00Z', balanceCredits: 484, allowanceCredits: 500, usedPercent: 3.2 } }
      : { error: 'Test checkout stopped' }), { status: path === '/api/billing' ? 200 : 400 }));
    render(<BillingPage />);
    expect(await screen.findByText('484 credits remaining')).toBeInTheDocument();
    expect(screen.getByText('3.2% used')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Monthly/ }));
    expect(screen.queryByLabelText('Top-up amount (KSh)')).not.toBeInTheDocument();
    expect(screen.getByText(/Renew manually; no automatic charges/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay by card' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/billing/checkout', expect.objectContaining({
      body: JSON.stringify({ channel: 'card', phone: '', kind: 'monthly', amountKes: 20 }),
    })));
  });
});
