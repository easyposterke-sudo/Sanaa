const encoder = new TextEncoder();
const ITERATIONS = 120_000;
const ACCESS_AGE = 60 * 60 * 24;
const REFRESH_AGE = 60 * 60 * 24 * 30;

export type Account = { id: string; email: string; name?: string; role: 'user' };
type UserRow = { id: string; email: string; name: string | null; password_salt: string; password_hash: string };
type SessionRow = { id: string; user_id: string; expires_at: number; access_expires_at: number; email: string; name: string | null };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g)!, (part) => parseInt(part, 16)), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)));
}

function account(row: { id: string; email: string; name: string | null }): Account {
  return { id: row.id, email: row.email, ...(row.name ? { name: row.name } : {}), role: 'user' };
}

async function issueSession(db: D1Database, user: { id: string; email: string; name: string | null }) {
  const token = randomHex();
  const refreshToken = randomHex();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO user_sessions (id, user_id, access_hash, access_expires_at, refresh_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, await sha256(token), now + ACCESS_AGE, await sha256(refreshToken), now + REFRESH_AGE, new Date().toISOString()).run();
  return { user: account(user), token, refreshToken, expiresIn: ACCESS_AGE };
}

export async function signup(db: D1Database, email: string, password: string, name: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 || name.length > 100 || password.length > 1024 || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: 'Use a valid email and a password of at least 8 characters with uppercase, lowercase, and a digit.', status: 400 as const };
  }
  const salt = randomHex();
  const hash = await passwordHash(password, salt);
  const user = { id: crypto.randomUUID(), email: normalized, name: name.trim() || null };
  try {
    await db.prepare('INSERT INTO users (id, email, name, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.id, user.email, user.name, salt, hash, new Date().toISOString()).run();
  } catch (error) {
    if (await db.prepare('SELECT id FROM users WHERE email = ?').bind(normalized).first()) {
      return { error: 'An account with this email already exists.', status: 409 as const };
    }
    throw error;
  }
  return issueSession(db, user);
}

export async function login(db: D1Database, email: string, password: string, clientIp: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || password.length > 1024) return { error: 'Invalid email or password.', status: 401 as const };
  const key = await sha256(`${clientIp}:${normalized}`);
  const now = Math.floor(Date.now() / 1000);
  const attempt = await db.prepare('SELECT failures, window_start FROM auth_attempts WHERE key = ?').bind(key).first<{ failures: number; window_start: number }>();
  if (attempt && attempt.window_start > now - 900 && attempt.failures >= 5) return { error: 'Too many attempts. Try again in 15 minutes.', status: 429 as const };
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(normalized).first<UserRow>();
  const hash = await passwordHash(password, user?.password_salt ?? '00'.repeat(32));
  // Both hashes have a fixed length; compare all bytes without early exit.
  let difference = 0;
  const expected = user?.password_hash ?? '00'.repeat(32);
  for (let index = 0; index < hash.length; index++) difference |= hash.charCodeAt(index) ^ expected.charCodeAt(index);
  if (!user || difference !== 0) {
    await db.prepare('INSERT INTO auth_attempts (key, failures, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET failures = ?, window_start = ?')
      .bind(key, now, attempt && attempt.window_start > now - 900 ? attempt.failures + 1 : 1, attempt && attempt.window_start > now - 900 ? attempt.window_start : now).run();
    return { error: 'Invalid email or password.', status: 401 as const };
  }
  await db.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(key).run();
  return issueSession(db, user);
}

export async function findAccount(db: D1Database, bearer: string | undefined): Promise<Account | null> {
  if (!bearer?.startsWith('Bearer ') || !/^[a-f0-9]{64}$/.test(bearer.slice(7))) return null;
  const row = await db.prepare('SELECT u.id, u.email, u.name, s.expires_at, s.access_expires_at FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.access_hash = ?')
    .bind(await sha256(bearer.slice(7))).first<SessionRow>();
  if (!row || row.access_expires_at <= Math.floor(Date.now() / 1000) || row.expires_at <= Math.floor(Date.now() / 1000)) return null;
  return account(row);
}

export async function refreshSession(db: D1Database, refreshToken: string) {
  if (!/^[a-f0-9]{64}$/.test(refreshToken)) return null;
  const row = await db.prepare('SELECT s.id, s.user_id, s.expires_at, u.email, u.name FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.refresh_hash = ?')
    .bind(await sha256(refreshToken)).first<SessionRow>();
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return null;
  const token = randomHex();
  const nextRefresh = randomHex();
  const now = Math.floor(Date.now() / 1000);
  const updated = await db.prepare('UPDATE user_sessions SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, expires_at = ? WHERE id = ? AND refresh_hash = ?')
    .bind(await sha256(token), now + ACCESS_AGE, await sha256(nextRefresh), now + REFRESH_AGE, row.id, await sha256(refreshToken)).run();
  if (!updated.meta.changes) return null;
  return { user: account({ id: row.user_id, email: row.email, name: row.name }), token, refreshToken: nextRefresh, expiresIn: ACCESS_AGE };
}

export async function logout(db: D1Database, refreshToken: string) {
  if (/^[a-f0-9]{64}$/.test(refreshToken)) {
    await db.prepare('DELETE FROM user_sessions WHERE refresh_hash = ?').bind(await sha256(refreshToken)).run();
  }
}
