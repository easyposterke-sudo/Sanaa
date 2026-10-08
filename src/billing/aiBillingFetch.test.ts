import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../lib/api';
import { aiBillingFetch, AI_COST_EVENT } from './aiBillingFetch';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('displays the quote before generation, enforces that cap, and shows the collected amount on failure', async () => {
  const notices: string[] = [];
  const listener = (event: Event) => notices.push((event as CustomEvent).detail.message);
  window.addEventListener(AI_COST_EVENT, listener);
  try {
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (path.endsWith('?estimate=1')) return Response.json({ estimate: { maximumCredits: 20, tier: 'paid', limited: true } });
      expect(notices.at(-1)).toContain('up to 20 pay-as-you-go credits');
      expect(new Headers(options?.headers).get('x-ai-max-credits')).toBe('20');
      return Response.json({ error: 'Incomplete output', billing: { credits: 12.4, coveredCredits: 0 } }, { status: 502 });
    });
    const result = await aiBillingFetch('/api/ai/poster-reconstruction', { method: 'POST', body: '{}' });
    expect(result.status).toBe(502);
    expect(notices.at(-1)).toBe('AI step failed · 12.4 credits used.');
    expect((await result.json()).error).toBe('Incomplete output');
  } finally { window.removeEventListener(AI_COST_EVENT, listener); }
});

it('does not generate when estimation fails', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ error: 'Add credits', code: 'AI_CREDIT_REQUIRED' }, { status: 402 }));
  expect((await aiBillingFetch('/api/ai/poster-element-edit', { method: 'POST' })).status).toBe(402);
  expect(apiFetch).toHaveBeenCalledOnce();
});

it('keeps free cache previews capped at zero and does not generate after cancellation', async () => {
  const controller = new AbortController();
  vi.mocked(apiFetch).mockImplementation(async () => {
    controller.abort();
    return Response.json({ estimate: { maximumCredits: 0, tier: 'free', limited: false } });
  });
  await expect(aiBillingFetch('/api/ai/poster-reconstruction', { method: 'POST', signal: controller.signal })).rejects.toThrow();
  expect(apiFetch).toHaveBeenCalledOnce();
});
