import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BILLING, paymentQuote, toCredits, type PurchaseKind } from '../../shared/billing';

type Balance = {
  balanceCredits: number; spentCredits: number; busy: boolean; plan: 'trial' | 'paid' | 'monthly'; trialUsedPercent: number;
  monthly: { active: boolean; expiresAt: string | null; balanceCredits: number; allowanceCredits: number; usedPercent: number };
  recentUsage: { request_id: string; credits: number; created_at: string }[];
  pricing: typeof BILLING; paymentsConfigured: boolean;
};
const credits = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const inputClass = 'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800';

export function BillingPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<PurchaseKind>('credits');
  const [amountKes, setAmountKes] = useState('20');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const pricing = balance?.pricing ?? BILLING;

  const refresh = async () => {
    try {
      const response = await apiFetch('/api/billing');
      if (!response.ok) throw new Error();
      setBalance(await response.json() as Balance);
    } catch { setMessage('Could not load your balance. Please refresh to try again.'); }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference') ?? sessionStorage.getItem('billing-pending');
    if (reference) { window.history.replaceState({}, '', '/billing'); setPending(reference); }
  }, []);
  useEffect(() => {
    if (!pending) return;
    sessionStorage.setItem('billing-pending', pending);
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      if (++attempts < 36) timer = setTimeout(check, 5000);
      else setMessage('Payment is still pending. Refresh this page to check again.');
    };
    const check = async () => {
      try {
        const response = await apiFetch(`/api/billing/payments/${encodeURIComponent(pending)}`);
        const result = await response.json() as { status?: string };
        if (stopped) return;
        if (result.status === 'success' || result.status === 'failed' || response.status === 404) {
          setPending(null);
          sessionStorage.removeItem('billing-pending');
          setMessage(result.status === 'success' ? 'Payment confirmed. Your credits are ready.' : 'The payment did not complete. You can try again.');
          if (result.status === 'success') void refresh();
        } else again();
      } catch { if (!stopped) again(); }
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [pending]);

  let validAmount = true;
  try { paymentQuote(kind, Number(amountKes)); } catch { validAmount = false; }
  const disabled = working || !balance?.paymentsConfigured || Boolean(pending) || !validAmount;
  const pay = async (channel: 'card' | 'mpesa') => {
    setWorking(true); setMessage('');
    try {
      const response = await apiFetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, phone, kind, amountKes: Number(amountKes) }) });
      const result = await response.json() as { error?: string; reference?: string; authorizationUrl?: string; displayText?: string };
      if (!response.ok || !result.reference) { setMessage(result.error || 'Could not start payment.'); return; }
      sessionStorage.setItem('billing-pending', result.reference);
      if (result.authorizationUrl) { window.location.assign(result.authorizationUrl); return; }
      setPending(result.reference);
      setMessage(result.displayText || 'Check your phone and approve the M-Pesa prompt.');
    } catch { setMessage('Could not reach the payment service.'); }
    finally { setWorking(false); }
  };

  return <main className="min-h-screen bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-6">
    <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow dark:bg-zinc-900">
      <Link to="/poster" className="text-sm text-accent-600">← Back to editor</Link>
      <h1 className="mt-4 text-2xl font-semibold">Billing and credits</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Start with 50 free trial credits. Add credits whenever you need them, or choose a monthly allowance.</p>
      <div className="mt-5 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
        <p className="text-sm">{balance?.plan === 'trial' ? 'Trial credits remaining' : 'Pay-as-you-go credits remaining'}</p>
        <p className="text-3xl font-semibold">{balance ? `${credits(balance.balanceCredits)} credits` : 'Loading…'}</p>
        {balance?.plan === 'trial' && <UsageMeter percent={balance.trialUsedPercent} label="Trial usage" />}
        {balance && <p className="mt-2 text-xs text-zinc-500">Total used: {credits(balance.spentCredits)} credits{balance.busy ? ' · AI request running' : ''}</p>}
      </div>
      {balance?.monthly.active && <div className="mt-3 rounded-lg border border-accent-300 p-4">
        <h2 className="font-semibold">Your monthly allowance</h2>
        <p className="mt-1 text-2xl font-semibold">{credits(balance.monthly.balanceCredits)} credits remaining</p>
        <UsageMeter percent={balance.monthly.usedPercent} label="Monthly usage" />
        <p className="mt-2 text-xs">Allowance: {credits(balance.monthly.allowanceCredits)} credits · Expires {new Date(balance.monthly.expiresAt!).toLocaleString()}</p>
      </div>}
      {balance?.monthly.expiresAt && !balance.monthly.active && <p className="mt-3 text-sm">Your monthly plan expired on {new Date(balance.monthly.expiresAt).toLocaleDateString()}. Renew below or use your pay-as-you-go credits.</p>}

      <fieldset className="mt-6">
        <legend className="font-semibold">Choose how you pay</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-4 ${kind === 'credits' ? 'border-accent-500 bg-accent-50 dark:bg-zinc-800' : 'border-zinc-300 dark:border-zinc-700'}`}>
            <input type="radio" name="purchase" value="credits" checked={kind === 'credits'} onChange={() => setKind('credits')} />
            <span className="ml-2 font-semibold">Pay as you go</span>
            <span className="mt-2 block text-sm">From KSh {pricing.minimumTopupKes}. Credits never expire.</span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-4 ${kind === 'monthly' ? 'border-accent-500 bg-accent-50 dark:bg-zinc-800' : 'border-zinc-300 dark:border-zinc-700'}`}>
            <input type="radio" name="purchase" value="monthly" checked={kind === 'monthly'} onChange={() => setKind('monthly')} />
            <span className="ml-2 font-semibold">Monthly · ${pricing.monthlyUsd}</span>
            <span className="mt-2 block text-sm">{toCredits(pricing.monthlyMicrousd)} credits for one month. 20% fewer credits per AI request than pay as you go.</span>
          </label>
        </div>
      </fieldset>
      {kind === 'credits' ? <>
        <label className="mt-5 block text-sm font-medium" htmlFor="topup-amount">Top-up amount (KSh)</label>
        <input id="topup-amount" type="number" min={pricing.minimumTopupKes} max={pricing.maximumTopupKes} step="1" value={amountKes} onChange={event => setAmountKes(event.target.value)} className={inputClass} />
        <p className="mt-2 text-sm">{validAmount ? `KSh ${Number(amountKes).toLocaleString()} adds ${credits(Number(amountKes) * pricing.microusdPerKes / pricing.microusdPerCredit)} credits.` : `Enter a whole-shilling amount from KSh ${pricing.minimumTopupKes} to ${pricing.maximumTopupKes.toLocaleString()}.`}</p>
      </> : <p className="mt-4 text-sm">Pay KSh {pricing.monthlyKes} for one month at our fixed conversion rate. Renew manually; no automatic charges. Renewing early adds another month and {toCredits(pricing.monthlyMicrousd)} credits. Unused monthly credits expire with the plan.</p>}
      <p className="mt-3 text-xs text-zinc-500">100 credits = $1 of service credit. Each AI request uses credits based on its size. Full poster generation or recreation needs at least {pricing.minimumGenerationCredits} credits in one balance. AI editing can use a smaller positive balance. Monthly credits are used first when sufficient; otherwise, pay-as-you-go credits apply at the standard rate. Existing daily request limits apply.</p>
      <button disabled={disabled} onClick={() => void pay('card')} className="mt-4 w-full rounded-lg bg-accent-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">Pay by card</button>
      <label className="mt-5 block text-sm font-medium" htmlFor="mpesa-phone">M-Pesa phone number</label>
      <input id="mpesa-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07… or +254…" className={inputClass} />
      <button disabled={disabled || !phone.trim()} onClick={() => void pay('mpesa')} className="mt-3 w-full rounded-lg border border-zinc-300 px-4 py-2.5 font-medium disabled:opacity-50 dark:border-zinc-600">Send M-Pesa prompt</button>
      {balance && !balance.paymentsConfigured && <p className="mt-3 text-sm text-amber-700">Payments will be available after Paystack is configured.</p>}
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      {pending && <p className="mt-2 text-sm">Waiting for payment confirmation…</p>}
      <h2 className="mt-7 font-semibold">Recent AI usage</h2>
      {balance && !balance.recentUsage.length && <p className="mt-2 text-sm text-zinc-500">No AI usage yet.</p>}
      <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
        {balance?.recentUsage.map(row => <li key={row.request_id} className="flex items-center justify-between gap-3 py-2">
          <span>{new Date(row.created_at).toLocaleString()}</span>
          <span className="whitespace-nowrap font-medium">{credits(row.credits)} credits</span>
        </li>)}
      </ul>
    </div>
  </main>;
}

function UsageMeter({ percent, label }: { percent: number; label: string }) {
  return <div className="mt-2">
    <p className="text-xs">{percent.toFixed(1)}% used</p>
    <progress aria-label={label} className="mt-1 h-2 w-full accent-accent-600" max={100} value={percent} />
  </div>;
}
