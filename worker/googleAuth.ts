import { googleAccount, sessionForUser } from './auth';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

function safeError(message: string) {
  return new Response(message, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function startGoogle(db: D1Database, origin: string, clientId: string, linkingUserId?: string, asJson = false) {
  const state = crypto.randomUUID() + crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 600;
  await db.prepare('INSERT INTO google_oauth_states (state, linking_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(state, linkingUserId ?? null, expires, new Date().toISOString()).run();
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return new Response(asJson ? JSON.stringify({ url: url.toString() }) : null, { status: asJson ? 200 : 302, headers: {
    ...(asJson ? { 'content-type': 'application/json' } : { location: url.toString() }),
    'set-cookie': `google_oauth_state=${state}; Max-Age=600; Path=/api/auth/google; HttpOnly; ${origin.startsWith('https:') ? 'Secure; ' : ''}SameSite=Lax`,
    'cache-control': 'no-store',
  } });
}

export async function finishGoogle(db: D1Database, request: Request, origin: string, clientId: string, clientSecret: string) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const cookie = /(?:^|;\s*)google_oauth_state=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
  if (!state || !code || state !== cookie || !/^[0-9a-f-]{72}$/.test(state)) return safeError('Google sign-in expired. Please try again.');
  const row = await db.prepare('SELECT state, linking_user_id, expires_at FROM google_oauth_states WHERE state = ?').bind(state)
    .first<{ state: string; linking_user_id: string | null; expires_at: number }>();
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return safeError('Google sign-in expired. Please try again.');
  const consumed = await db.prepare('DELETE FROM google_oauth_states WHERE state = ?').bind(row.state).run();
  if (!consumed.meta.changes) return safeError('Google sign-in was already used.');
  const tokenResponse = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: 'authorization_code',
  }) });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!tokenResponse.ok || !token.access_token) return safeError('Google sign-in could not be completed.');
  const profileResponse = await fetch(GOOGLE_USERINFO, { headers: { authorization: `Bearer ${token.access_token}` } });
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) return safeError('Google did not provide a verified email address.');
  const linkingUserId = row.linking_user_id ?? undefined;
  const result = await googleAccount(db, profile.sub, profile.email, profile.name ?? '', linkingUserId);
  if ('error' in result) return safeError(result.error);
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  await db.prepare('INSERT INTO google_login_tickets (ticket, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(ticket, result.user.id, Math.floor(Date.now() / 1000) + 90).run();
  return new Response(null, { status: 302, headers: {
    location: `${origin}/login?google_ticket=${encodeURIComponent(ticket)}`,
    'set-cookie': `google_oauth_state=; Max-Age=0; Path=/api/auth/google; HttpOnly; ${origin.startsWith('https:') ? 'Secure; ' : ''}SameSite=Lax`,
    'cache-control': 'no-store',
  } });
}

export async function exchangeGoogleTicket(db: D1Database, ticket: string) {
  if (!/^[0-9a-f-]{72}$/.test(ticket)) return null;
  const row = await db.prepare('SELECT user_id, expires_at FROM google_login_tickets WHERE ticket = ?').bind(ticket)
    .first<{ user_id: string; expires_at: number }>();
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null;
  const consumed = await db.prepare('DELETE FROM google_login_tickets WHERE ticket = ?').bind(ticket).run();
  if (!consumed.meta.changes) return null;
  return sessionForUser(db, row.user_id);
}
