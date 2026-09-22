import type { Account } from './auth';

type AccessKey = JsonWebKey & { kid?: string };
type AccessClaims = { aud?: string | string[]; email?: string; exp?: number; iss?: string; nbf?: number };

const keyCache = new Map<string, { expiresAt: number; keys: AccessKey[] }>();

function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function accessToken(request: Request): string | null {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (assertion) return assertion;
  return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length) ?? null;
}

async function signingKeys(teamDomain: string): Promise<AccessKey[]> {
  const cached = keyCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error('Cloudflare Access signing keys are unavailable.');
  const body = await response.json() as { keys?: AccessKey[] };
  if (!Array.isArray(body.keys)) throw new Error('Cloudflare Access signing keys are invalid.');
  keyCache.set(teamDomain, { keys: body.keys, expiresAt: Date.now() + 5 * 60_000 });
  return body.keys;
}

/** Return the email only after verifying the token signature, issuer, audience, and lifetime. */
export async function verifiedAccessEmail(request: Request, env: Env): Promise<string | null> {
  const domain = env.ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
  const audience = env.ACCESS_ADMIN_AUD;
  const token = accessToken(request);
  if (!domain || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) || !audience || !token) return null;
  try {
    const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return null;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    const key = (await signingKeys(domain)).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
    if (!key) return null;
    const publicKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decodeBase64Url(encodedSignature) as BufferSource, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as AccessClaims;
    const now = Math.floor(Date.now() / 1000);
    const claimsValid = claims.iss === domain &&
      (claims.aud === audience || Array.isArray(claims.aud) && claims.aud.includes(audience)) &&
      typeof claims.exp === 'number' && claims.exp > now &&
      (claims.nbf === undefined || claims.nbf <= now) &&
      typeof claims.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email);
    return claimsValid ? claims.email!.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** A signed Access application token must belong to this app and this account. */
export async function isAccessAdmin(request: Request, env: Env, account: Account): Promise<boolean> {
  return await verifiedAccessEmail(request, env) === account.email.toLowerCase();
}

export async function accountWithAccessRole(request: Request, env: Env, account: Account): Promise<Account> {
  return await isAccessAdmin(request, env, account) ? { ...account, role: 'admin' } : account;
}
