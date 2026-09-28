// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { creditVerifiedPayment, reserveAi, settleAi, usageCost, wallet } from './billing';
import { beginPayment, normalizeKenyanPhone, validPaystackSignature, verifyPayment } from './paystack';
import { BILLING, paymentQuote } from '../shared/billing';
import { googleAccount, sessionForUser } from './auth';
import { startGoogle, finishGoogle, exchangeGoogleTicket } from './googleAuth';

const mf = new Miniflare({ workers: [{ config: {
  name: 'billing-test', type: 'worker', compatibilityDate: '2026-08-18',
  manifest: { mainModule: 'index.js', modulesRoot: process.cwd(), modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } }' } } },
  env: { DB: { type: 'd1', name: 'billing-test-db' } },
} }] });
let db: D1Database;
const userId = 'billing-user';

beforeAll(async () => {
  db = await mf.getD1Database('DB', 'billing-test');
  for (const migration of ['0009_user_auth.sql', '0010_billing_google.sql', '0011_billing_plans.sql']) {
    const sql = readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.prepare('INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, 'billing@example.com', 'salt', 'hash', new Date().toISOString()).run();
});
afterAll(async () => { await mf.dispose(); });

async function newWallet() {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, `${id}@example.com`, 'salt', 'hash', new Date().toISOString()).run();
  await wallet(db, id);
  return id;
}

async function payFor(id: string, kind: 'credits' | 'monthly', amountKes = 20) {
  const ref = `ep-${crypto.randomUUID()}`;
  const quote = paymentQuote(kind, amountKes);
  await db.prepare('INSERT INTO billing_payments (reference, user_id, channel, amount_minor, credit_microusd, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(ref, id, 'mpesa', quote.amountMinor, quote.creditMicrousd, kind, new Date().toISOString()).run();
  expect(await creditVerifiedPayment(db, ref, quote.amountMinor, 'KES', 'success')).toBe(true);
  return ref;
}

describe('credit pricing and monthly allowances', () => {
  const twoCents = { input_tokens: 100_000, output_tokens: 0 };

  it('charges a $0.02 request 10 trial credits and 20 paid credits, exactly once', async () => {
    const id = await newWallet();
    await reserveAi(db, id, 'trial-priced');
    await settleAi(db, id, 'trial-priced', 'gpt-5.6-luna', twoCents);
    await settleAi(db, id, 'trial-priced', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 40, spentCredits: 10, trialUsedPercent: 20 });
    await payFor(id, 'credits');
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 55.2, plan: 'paid' });
    await reserveAi(db, id, 'paid-priced');
    await settleAi(db, id, 'paid-priced', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 35.2, spentCredits: 30 });
  });

  it('keeps the trial rate when a top-up arrives during generation', async () => {
    const id = await newWallet();
    await reserveAi(db, id, 'trial-inflight');
    await payFor(id, 'credits');
    await settleAi(db, id, 'trial-inflight', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 55.2, spentCredits: 10 });
  });

  it('grants 500 monthly credits once and charges 16 credits for $0.02', async () => {
    const id = await newWallet();
    const ref = await payFor(id, 'monthly');
    const first = await wallet(db, id);
    expect(first).toMatchObject({ plan: 'monthly', balanceCredits: 50, monthly: { active: true, balanceCredits: 500 } });
    expect(await creditVerifiedPayment(db, ref, BILLING.monthlyKes * 100, 'KES', 'success')).toBe(true);
    expect((await wallet(db, id)).monthly).toEqual(first.monthly);
    await reserveAi(db, id, 'monthly-priced');
    await settleAi(db, id, 'monthly-priced', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 50, spentCredits: 16, monthly: { balanceCredits: 484 } });
    await payFor(id, 'monthly');
    const renewed = await wallet(db, id);
    expect(renewed.monthly.balanceCredits).toBe(984);
    expect(renewed.monthly.allowanceCredits).toBe(1000);
    expect(Date.parse(renewed.monthly.expiresAt!)).toBeGreaterThan(Date.parse(first.monthly.expiresAt!));
  });

  it('uses monthly credits with an empty wallet, then paid credits on exhaustion or expiry', async () => {
    const id = await newWallet();
    await payFor(id, 'monthly');
    await db.prepare('UPDATE billing_wallets SET balance_microusd = 0 WHERE user_id = ?').bind(id).run();
    expect(await reserveAi(db, id, 'monthly-empty-wallet')).toBe(true);
    await settleAi(db, id, 'monthly-empty-wallet', 'gpt-5.6-luna', twoCents);
    await db.prepare('UPDATE billing_wallets SET monthly_balance_microusd = 0 WHERE user_id = ?').bind(id).run();
    expect(await reserveAi(db, id, 'no-credits')).toBe(false);
    await payFor(id, 'credits', 100);
    expect(await reserveAi(db, id, 'monthly-exhausted')).toBe(true);
    await settleAi(db, id, 'monthly-exhausted', 'gpt-5.6-luna', twoCents);
    expect((await wallet(db, id)).balanceCredits).toBe(56);
    await db.prepare('UPDATE billing_wallets SET monthly_until = 1, monthly_balance_microusd = 5000000 WHERE user_id = ?').bind(id).run();
    expect((await wallet(db, id)).monthly).toMatchObject({ active: false, balanceCredits: 0 });
    await reserveAi(db, id, 'monthly-expired');
    await settleAi(db, id, 'monthly-expired', 'gpt-5.6-luna', twoCents);
    expect((await wallet(db, id)).balanceCredits).toBe(36);
    await payFor(id, 'monthly');
    expect((await wallet(db, id)).monthly.balanceCredits).toBe(500);
  });

  it('settles a delayed request without clearing a newer reservation', async () => {
    const id = await newWallet();
    await reserveAi(db, id, 'delayed');
    await db.prepare('UPDATE billing_wallets SET active_until = 1 WHERE user_id = ?').bind(id).run();
    await reserveAi(db, id, 'newer');
    await settleAi(db, id, 'delayed', 'gpt-5.6-luna', twoCents);
    expect((await wallet(db, id)).busy).toBe(true);
    await settleAi(db, id, 'newer', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ busy: false, balanceCredits: 30 });
    await settleAi(db, id, 'unknown', 'gpt-5.6-luna', twoCents);
    expect((await wallet(db, id)).balanceCredits).toBe(30);
  });

  it('rejects invalid amounts and builds a KSh 20 M-Pesa charge', async () => {
    for (const amount of [undefined, 0, 19, 20.5, NaN, Infinity, 100001]) expect(() => paymentQuote('credits', amount)).toThrow();
    expect(paymentQuote('credits', 20)).toEqual({ amountMinor: 2000, creditMicrousd: 152000 });
    expect(paymentQuote('monthly', 20)).toEqual({ amountMinor: 65800, creditMicrousd: 0 });
    const id = await newWallet();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      expect(payload).toMatchObject({ amount: 2000, currency: 'KES', mobile_money: { phone: '+254722000000', provider: 'mpesa' } });
      return new Response(JSON.stringify({ status: true, data: { reference: payload.reference, status: 'pay_offline' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const started = await beginPayment(db, 'secret', { id, email: 'test@example.com' }, 'https://example.com', 'mpesa', '0722000000', 'credits', 20);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await wallet(db, id)).balanceCredits).toBe(50);
      expect(await creditVerifiedPayment(db, started.reference, 2000, 'USD', 'success')).toBe(false);
      expect(await creditVerifiedPayment(db, started.reference, 2000, 'KES', 'failed')).toBe(false);
      expect(await creditVerifiedPayment(db, started.reference, 2000, 'KES', 'success')).toBe(true);
      expect((await wallet(db, id)).balanceCredits).toBe(65.2);
    } finally { vi.unstubAllGlobals(); }
  });

  it('clamps calendar-month renewals at month end', async () => {
    const id = await newWallet();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-31T12:34:56Z'));
    try {
      await payFor(id, 'monthly');
      expect((await wallet(db, id)).monthly.expiresAt).toBe('2027-02-28T12:34:56.000Z');
    } finally { now.mockRestore(); }
  });

  it('serializes concurrent payment confirmations and concurrent usage settlement', async () => {
    const id = await newWallet();
    const reference = `ep-${crypto.randomUUID()}`;
    await db.prepare('INSERT INTO billing_payments (reference, user_id, channel, amount_minor, credit_microusd, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(reference, id, 'card', 65800, 0, 'monthly', new Date().toISOString()).run();
    await Promise.all([creditVerifiedPayment(db, reference, 65800, 'KES', 'success'), creditVerifiedPayment(db, reference, 65800, 'KES', 'success')]);
    expect((await wallet(db, id)).monthly.balanceCredits).toBe(500);
    const reserved = await Promise.all([reserveAi(db, id, 'concurrent-1'), reserveAi(db, id, 'concurrent-2')]);
    expect(reserved.filter(Boolean)).toHaveLength(1);
    const requestId = reserved[0] ? 'concurrent-1' : 'concurrent-2';
    await Promise.all([settleAi(db, id, requestId, 'gpt-5.6-luna', twoCents), settleAi(db, id, requestId, 'gpt-5.6-luna', twoCents)]);
    expect(await wallet(db, id)).toMatchObject({ spentCredits: 16, monthly: { balanceCredits: 484 } });
  });

  it('does not debit cancelled reservations and blocks an exhausted trial', async () => {
    const id = await newWallet();
    await reserveAi(db, id, 'cancelled');
    await settleAi(db, id, 'cancelled', 'gpt-5.6-luna');
    await settleAi(db, id, 'cancelled', 'gpt-5.6-luna', twoCents);
    expect((await wallet(db, id)).balanceCredits).toBe(50);
    await reserveAi(db, id, 'last-trial');
    await settleAi(db, id, 'last-trial', 'gpt-5.6-luna', { input_tokens: 1000, output_tokens: 100000 });
    expect((await wallet(db, id)).balanceCredits).toBe(0);
    expect(await reserveAi(db, id, 'exhausted')).toBe(false);
  });

  it('does not debit a fresh monthly allowance for a delayed request from an expired period', async () => {
    const id = await newWallet();
    await payFor(id, 'monthly');
    await reserveAi(db, id, 'old-period');
    await db.prepare('UPDATE billing_wallets SET monthly_until = 1 WHERE user_id = ?').bind(id).run();
    await payFor(id, 'monthly');
    await settleAi(db, id, 'old-period', 'gpt-5.6-luna', twoCents);
    expect(await wallet(db, id)).toMatchObject({ balanceCredits: 50, monthly: { balanceCredits: 500 } });
  });
});

describe('AI credit and Paystack settlement', () => {
  it('calculates cached and uncached token cost in micro USD', () => {
    expect(usageCost({ input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 200 } }, 'gpt-5.6-luna'))
      .toMatchObject({ input: 1000, cached: 200, output: 500, cost: 764 });
    expect(usageCost({ input_tokens: 273_000, output_tokens: 1_000 }, 'gpt-5.6-luna').cost).toBe(111_000);
  });

  it('grants one trial, locks concurrent calls, and records reported usage', async () => {
    expect((await wallet(db, userId)).balanceMicrousd).toBe(500_000);
    expect(await reserveAi(db, userId, 'ai-1')).toBe(true);
    expect(await reserveAi(db, userId, 'ai-2')).toBe(false);
    await settleAi(db, userId, 'ai-1', 'gpt-5.6-luna', { input_tokens: 1000, output_tokens: 500 });
    expect((await wallet(db, userId)).balanceMicrousd).toBe(496_000);
    expect(await db.prepare('SELECT cost_microusd FROM ai_usage WHERE request_id = ?').bind('ai-1').first<{ cost_microusd: number }>()).toMatchObject({ cost_microusd: 800 });
    expect(await reserveAi(db, userId, 'ai-2')).toBe(true);
    await settleAi(db, userId, 'ai-2', 'gpt-5.6-luna');
  });

  it('credits a verified KES payment exactly once and rejects amount mismatch', async () => {
    await db.prepare('INSERT INTO billing_payments (reference, user_id, channel, amount_minor, credit_microusd, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('ep-payment', userId, 'card', 50_000, 3_800_000, new Date().toISOString()).run();
    expect(await creditVerifiedPayment(db, 'ep-payment', 49_999, 'KES', 'success')).toBe(false);
    expect(await creditVerifiedPayment(db, 'ep-payment', 50_000, 'KES', 'success')).toBe(true);
    expect(await creditVerifiedPayment(db, 'ep-payment', 50_000, 'KES', 'success')).toBe(true);
    expect((await wallet(db, userId)).balanceMicrousd).toBe(4_296_000);
  });

  it('checks Paystack server side before crediting and does not credit twice', async () => {
    const reference = 'ep-12345678-1234-1234-1234-123456789abc';
    await db.prepare('INSERT INTO billing_payments (reference, user_id, channel, amount_minor, credit_microusd, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(reference, userId, 'mpesa', 50_000, 3_800_000, new Date().toISOString()).run();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: true, data: { reference, amount: 50_000, currency: 'KES', status: 'success' } })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await verifyPayment(db, 'secret', reference, userId)).toEqual({ status: 'success' });
      expect(await verifyPayment(db, 'secret', reference, userId)).toEqual({ status: 'success' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await wallet(db, userId)).balanceMicrousd).toBe(8_096_000);
    } finally { vi.unstubAllGlobals(); }
  });

  it('validates M-Pesa numbers and authenticates webhook signatures', async () => {
    expect(normalizeKenyanPhone('0722 000 000')).toBe('+254722000000');
    expect(normalizeKenyanPhone('123')).toBeNull();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-secret'), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('{"event":"charge.success"}')));
    const signature = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    expect(await validPaystackSignature('{"event":"charge.success"}', signature, 'test-secret')).toBe(true);
    expect(await validPaystackSignature('{}', signature, 'test-secret')).toBe(false);
  });

  it('creates Google accounts once and requires explicit linking for password accounts', async () => {
    const first = await googleAccount(db, 'google-sub-1', 'google@example.com', 'Google User');
    expect(first).toHaveProperty('user');
    const repeat = await googleAccount(db, 'google-sub-1', 'changed@example.com', 'Different Name');
    expect(repeat).toEqual(first);
    expect(await googleAccount(db, 'google-sub-2', 'billing@example.com', 'Billing User')).toHaveProperty('error');
    const linked = await googleAccount(db, 'google-sub-2', 'billing@example.com', 'Billing User', userId);
    expect(linked).toMatchObject({ user: { id: userId } });
    expect(await sessionForUser(db, userId)).toHaveProperty('token');
  });

  it('validates Google state and consumes a one time login ticket', async () => {
    const origin = 'http://127.0.0.1:5173';
    const start = await startGoogle(db, origin, 'client-id');
    const authorize = new URL(start.headers.get('location')!);
    const state = authorize.searchParams.get('state')!;
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/google/callback`);
    const invalid = await finishGoogle(db, new Request(`${origin}/api/auth/google/callback?state=${state}&code=abc`, { headers: { cookie: 'google_oauth_state=wrong' } }), origin, 'client-id', 'client-secret');
    expect(invalid.status).toBe(400);
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('/token') ? { access_token: 'google-access' } : { sub: 'oauth-sub', email: 'oauth@example.com', email_verified: true, name: 'OAuth User' },
    ), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const callback = await finishGoogle(db, new Request(`${origin}/api/auth/google/callback?state=${state}&code=abc`, { headers: { cookie } }), origin, 'client-id', 'client-secret');
      expect(callback.status).toBe(302);
      const ticket = new URL(callback.headers.get('location')!).searchParams.get('google_ticket')!;
      expect(await exchangeGoogleTicket(db, ticket)).toHaveProperty('token');
      expect(await exchangeGoogleTicket(db, ticket)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
