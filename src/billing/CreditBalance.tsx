import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore';
import { apiFetch } from '../lib/api';
import { BILLING_UPDATED_EVENT } from './billingEvents';

type CreditSnapshot = {
  balanceCredits: number;
  monthly: { active: boolean; balanceCredits: number };
};

const formatCredits = (amount: number) => amount.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function CreditBalance() {
  const userId = useAuthStore((state) => state.user?.id);
  const [snapshot, setSnapshot] = useState<{ userId: string; balance: CreditSnapshot } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let inFlight = false;
    let refreshQueued = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden || disposed) return;
      if (inFlight) { refreshQueued = true; return; }
      inFlight = true;
      try {
        const response = await apiFetch('/api/billing', { signal: controller.signal, cache: 'no-store', timeoutMs: 15_000 });
        if (!response.ok) throw new Error('Balance unavailable');
        const balance = await response.json() as CreditSnapshot;
        if (!Number.isFinite(balance.balanceCredits) || !Number.isFinite(balance.monthly?.balanceCredits)) throw new Error('Invalid balance');
        if (!disposed) { setSnapshot({ userId, balance }); setFailed(false); }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        inFlight = false;
        if (refreshQueued && !disposed) { refreshQueued = false; void refresh(); }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(BILLING_UPDATED_EVENT, refresh);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(BILLING_UPDATED_EVENT, refresh);
    };
  }, [userId]);

  if (!userId) return null;
  const balance = snapshot?.userId === userId ? snapshot.balance : null;
  const monthly = balance?.monthly.active ? balance.monthly.balanceCredits : 0;
  const total = balance ? balance.balanceCredits + monthly : null;
  const label = failed ? 'Credits unavailable' : total === null ? 'Loading credits' : `${formatCredits(total)} credits remaining`;
  const details = balance && !failed
    ? `${formatCredits(balance.balanceCredits)} trial / pay-as-you-go${monthly > 0 ? ` + ${formatCredits(monthly)} monthly` : ''}. `
    : '';

  return (
    <Link to="/billing" target="_blank" rel="noopener noreferrer" aria-label={`${label}. Open billing in a new tab`} title={`${label}. ${details}Open billing in a new tab.`} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent-300 bg-accent-50 px-2 py-1 text-[10px] font-medium text-accent-800 hover:bg-accent-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:border-accent-800 dark:bg-accent-950 dark:text-accent-200">
      <span aria-hidden="true">✦</span>
      <span role="status" aria-live="polite">{failed ? 'Credits —' : total === null ? 'Credits …' : <><span className="tabular-nums">{formatCredits(total)}</span> credits</>}</span>
    </Link>
  );
}
