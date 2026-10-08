import { apiFetch } from '../lib/api';

export const AI_COST_EVENT = 'sanaa:ai-cost';
export type AiCostNotice = { message: string; running: boolean };
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
function notice(message: string, running: boolean) {
  window.dispatchEvent(new CustomEvent<AiCostNotice>(AI_COST_EVENT, { detail: { message, running } }));
}

/** Preview the cost before starting generation, and cap the submitted request
 * at that preview even if a payment or plan expiry happens between the calls. */
export async function aiBillingFetch(path: string, options: Parameters<typeof apiFetch>[1]) {
  notice('Estimating AI credits…', true);
  try {
    const preview = await apiFetch(`${path}?estimate=1`, options);
    const data = await preview.json() as { estimate?: { maximumCredits: number; tier: string; limited: boolean }; error?: string };
    if (!preview.ok) {
      notice(data.error ?? 'Could not estimate AI credits. No generation started.', false);
      return new Response(JSON.stringify(data), { status: preview.status });
    }
    if (!data.estimate || !Number.isFinite(data.estimate.maximumCredits) || data.estimate.maximumCredits < 0) throw new Error('The AI service did not return a credit estimate.');
    const { maximumCredits, tier, limited } = data.estimate;
    notice(maximumCredits === 0 ? 'Using a saved result · 0 credits.' : `This AI step: up to ${format(maximumCredits)} ${tier === 'paid' ? 'pay-as-you-go' : tier} credits. Unused credits return afterward.${limited ? ' Response length is limited by your balance.' : ''}`, true);
    options?.signal?.throwIfAborted();
    const headers = new Headers(options?.headers);
    headers.set('x-ai-max-credits', String(maximumCredits));
    const response = await apiFetch(path, { ...options, headers });
    // Buffer once so receipts are visible even when the generation fails.
    const body = await response.text();
    let receipt: { billing?: { credits?: number; coveredCredits?: number }; source?: string; code?: string } = {};
    try { receipt = JSON.parse(body); } catch { /* The caller reports malformed responses. */ }
    if (typeof receipt.billing?.credits === 'number') {
      notice(`${response.ok ? 'AI step complete' : 'AI step failed'} · ${format(receipt.billing.credits)} credits used.${receipt.billing.coveredCredits ? ' Additional usage was covered by Sanaa.' : ''}`, false);
    } else if (receipt.source === 'cache' || receipt.source === 'fallback') notice('Saved result · 0 credits used.', false);
    else if (response.status === 415 && receipt.code === 'INVALID_CONTENT_TYPE') notice('Request rejected before generation · 0 credits used.', false);
    else notice('Check Billing and credits for this request’s final charge.', false);
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    notice('AI request stopped. Check Billing and credits for any reported usage.', false);
    throw error;
  }
}
