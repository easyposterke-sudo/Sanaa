// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { creditVerifiedPayment, reserveAi, settleAi, usageCost, wallet } from './billing';
import { normalizeKenyanPhone, validPaystackSignature, verifyPayment } from './paystack';
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
  for (const migration of ['0009_user_auth.sql', '0010_billing_google.sql']) {
    const sql = readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.prepare('INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, 'billing@example.com', 'salt', 'hash', new Date().toISOString()).run();
});
afterAll(async () => { await mf.dispose(); });

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
    expect((await wallet(db, userId)).balanceMicrousd).toBe(499_200);
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
    expect((await wallet(db, userId)).balanceMicrousd).toBe(4_299_200);
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
      expect((await wallet(db, userId)).balanceMicrousd).toBe(8_099_200);
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
