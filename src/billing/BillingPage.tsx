import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

type UsageRow = { request_id: string; model: string; input_tokens: number; cached_input_tokens: number; output_tokens: number; cost_microusd: number; created_at: string };
type Balance = { balanceMicrousd: number; spentMicrousd: number; busy: boolean; recentUsage: UsageRow[]; package: { amountKes: number; creditUsd: number }; paymentsConfigured: boolean };

export function BillingPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  const refresh = async () => {
    const response = await apiFetch('/api/billing');
    if (response.ok) setBalance(await response.json() as Balance);
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (reference) { window.history.replaceState({}, '', '/billing'); setPending(reference); }
  }, []);
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let attempts = 0;
    const check = async () => {
      try {
        const response = await apiFetch(`/api/billing/payments/${encodeURIComponent(pending)}`);
        const result = await response.json() as { status?: string };
        if (stopped) return;
        if (result.status === 'success') { setPending(null); setMessage('Payment confirmed. Your AI credit is ready.'); void refresh(); }
        else if (result.status === 'failed') { setPending(null); setMessage('The payment did not complete. You can try again.'); }
        else if (++attempts < 36) setTimeout(check, 5000);
        else setMessage('Payment is still pending. Refresh this page to check again.');
      } catch { if (!stopped) setTimeout(check, 5000); }
    };
    void check();
    return () => { stopped = true; };
  }, [pending]);

  const pay = async (channel: 'card' | 'mpesa') => {
    setWorking(true); setMessage('');
    try {
      const response = await apiFetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, phone }) });
      const result = await response.json() as { error?: string; reference?: string; authorizationUrl?: string; displayText?: string };
      if (!response.ok || !result.reference) { setMessage(result.error || 'Could not start payment.'); return; }
      if (result.authorizationUrl) { window.location.assign(result.authorizationUrl); return; }
      setPending(result.reference);
      setMessage(result.displayText || 'Check your phone and approve the M-Pesa prompt.');
    } catch { setMessage('Could not reach the payment service.'); }
    finally { setWorking(false); }
  };

  return <main className="min-h-screen bg-zinc-100 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div className="mx-auto max-w-lg rounded-xl bg-white p-6 shadow dark:bg-zinc-900">
      <Link to="/poster" className="text-sm text-accent-600">← Back to editor</Link>
      <h1 className="mt-4 text-2xl font-semibold">Billing and AI credit</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Every account starts with $0.50 of OpenAI token usage credit. AI calls are deducted after OpenAI reports their actual token usage.</p>
      <div className="mt-5 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
        <p className="text-sm">Available AI credit</p>
        <p className="text-3xl font-semibold">{balance ? `$${(balance.balanceMicrousd / 1_000_000).toFixed(4)}` : 'Loading…'}</p>
        {balance && <p className="mt-1 text-xs text-zinc-500">Total used: ${(balance.spentMicrousd / 1_000_000).toFixed(4)}{balance.busy ? ' · AI request running' : ''}</p>}
      </div>
      <h2 className="mt-6 font-semibold">Add credit</h2>
      <p className="mt-1 text-sm">KSh 500 adds $3.80 of AI usage credit.</p>
      <button disabled={working || !balance?.paymentsConfigured} onClick={() => void pay('card')} className="mt-4 w-full rounded-lg bg-accent-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">Pay by card</button>
      <label className="mt-5 block text-sm font-medium" htmlFor="mpesa-phone">M-Pesa phone number</label>
      <input id="mpesa-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07… or +254…" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
      <button disabled={working || !balance?.paymentsConfigured || Boolean(pending)} onClick={() => void pay('mpesa')} className="mt-3 w-full rounded-lg border border-zinc-300 px-4 py-2.5 font-medium disabled:opacity-50 dark:border-zinc-600">Send M-Pesa prompt</button>
      {!balance?.paymentsConfigured && <p className="mt-3 text-sm text-amber-700">Payments will be available after Paystack is configured.</p>}
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      {pending && <p className="mt-2 text-sm">Waiting for payment confirmation…</p>}
      <h2 className="mt-7 font-semibold">Recent AI usage</h2>
      {!balance?.recentUsage.length && <p className="mt-2 text-sm text-zinc-500">No AI usage yet.</p>}
      <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
        {balance?.recentUsage.map(row => <li key={row.request_id} className="flex items-center justify-between gap-3 py-2">
          <span><span className="block">{new Date(row.created_at).toLocaleString()}</span><span className="text-xs text-zinc-500">{row.input_tokens.toLocaleString()} in ({row.cached_input_tokens.toLocaleString()} cached) · {row.output_tokens.toLocaleString()} out</span></span>
          <span className="whitespace-nowrap font-medium">${(row.cost_microusd / 1_000_000).toFixed(4)}</span>
        </li>)}
      </ul>
    </div>
  </main>;
}
