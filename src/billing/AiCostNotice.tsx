import { useEffect, useState } from 'react';
import { AI_COST_EVENT, type AiCostNotice as Notice } from './aiBillingFetch';
import { BILLING } from '../../shared/billing';

export function AiCostNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    const onCost = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    window.addEventListener(AI_COST_EVENT, onCost);
    return () => window.removeEventListener(AI_COST_EVENT, onCost);
  }, []);
  if (!notice) return null;
  return <aside role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-[150] mx-auto max-w-lg rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
    <p>{notice.message}</p>
    {!notice.running && <button type="button" onClick={() => setNotice(null)} className="mt-2 underline">Dismiss</button>}
  </aside>;
}

/** An explicitly illustrative estimate is visible before the user starts.
 * The server previews and caps each actual AI step using its complete input. */
export function AiPricingHint({ reference = false }: { reference?: boolean }) {
  if (reference) return <p className="mt-3 text-xs text-zinc-500">Reference reconstruction: up to {BILLING.referenceMaximumPaidCredits} pay-as-you-go credits; you pay less when usage is lower. KSh 20 adds 25 credits, leaving at least 3 after this step for further work. AI edits and optional review cost extra. Failed or incomplete AI responses can still use credits.</p>;
  return <p className="mt-3 text-xs text-zinc-500">Example AI step: about 4 trial, 8 pay-as-you-go, or 6.4 monthly credits for a medium response. Larger requests cost more; automatic review is a separate step. A maximum credit estimate appears before each step starts. Failed or incomplete responses can still use credits.</p>;
}
