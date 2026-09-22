// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { isAccessAdmin, verifiedAccessEmail } from './adminAccess';

const domain = 'https://access-admin-test.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: domain, ACCESS_ADMIN_AUD: 'admin-audience' } as Env;
const account = { id: 'user-1', email: 'admin@example.com', role: 'user' as const };
let privateKey: CryptoKey;

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

async function token(changes: Record<string, unknown> = {}) {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'test-key' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: domain, aud: ['admin-audience'], email: account.email,
    exp: Math.floor(Date.now() / 1000) + 600, ...changes,
  })));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  privateKey = keys.privateKey;
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...publicJwk, kid: 'test-key' }] })));
});

describe('Cloudflare Access admin identity', () => {
  it('accepts a signed application cookie for the matching account', async () => {
    const request = new Request('https://studio.example.com/api/auth/me', { headers: { cookie: `CF_Authorization=${await token()}` } });
    expect(await verifiedAccessEmail(request, env)).toBe(account.email);
    expect(await isAccessAdmin(request, env, account)).toBe(true);
    expect(await isAccessAdmin(request, env, { ...account, email: 'other@example.com' })).toBe(false);
  });

  it('rejects forged, expired, and wrong-audience tokens', async () => {
    const signed = await token();
    const forged = `${signed.slice(0, -2)}zz`;
    for (const value of [forged, await token({ exp: 1 }), await token({ aud: ['another-app'] })]) {
      expect(await verifiedAccessEmail(new Request('https://studio.example.com/api/auth/me', { headers: { 'cf-access-jwt-assertion': value } }), env)).toBeNull();
    }
    expect(await verifiedAccessEmail(new Request('https://studio.example.com/api/auth/me'), env)).toBeNull();
  });
});
