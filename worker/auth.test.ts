// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { findAccount, login, logout, refreshSession, signup } from './auth';

const mf = new Miniflare({
  workers: [{ config: {
    name: 'auth-test', type: 'worker', compatibilityDate: '2026-08-18',
    manifest: { mainModule: 'index.js', modulesRoot: process.cwd(), modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } }' } } },
    env: { DB: { type: 'd1', name: 'auth-test-db' } },
  } }],
});
let db: D1Database;

beforeAll(async () => {
  db = await mf.getD1Database('DB', 'auth-test');
  const migration = readFileSync(new URL('../migrations/0009_user_auth.sql', import.meta.url), 'utf8');
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
});
afterAll(async () => { await mf.dispose(); });

describe('email/password accounts', () => {
  it('creates an isolated user, authenticates, rotates sessions, and signs out', async () => {
    const created = await signup(db, ' Person@Example.com ', 'StrongPass1', 'Person');
    expect(created).toHaveProperty('token');
    if (!('token' in created)) throw new Error('signup failed');
    expect(created.user.email).toBe('person@example.com');
    expect(created.user.role).toBe('user');
    expect(await findAccount(db, `Bearer ${created.token}`)).toEqual(created.user);
    expect(await signup(db, 'person@example.com', 'StrongPass1', 'Other')).toMatchObject({ status: 409 });
    expect(await login(db, 'person@example.com', 'wrong', 'test-ip')).toMatchObject({ status: 401 });

    const signedIn = await login(db, 'person@example.com', 'StrongPass1', 'test-ip');
    expect(signedIn).toHaveProperty('token');
    if (!('token' in signedIn)) throw new Error('login failed');
    const rotated = await refreshSession(db, signedIn.refreshToken);
    expect(rotated?.token).toBeTruthy();
    expect(await refreshSession(db, signedIn.refreshToken)).toBeNull();
    expect(await findAccount(db, `Bearer ${signedIn.token}`)).toBeNull();
    await logout(db, rotated!.refreshToken);
    expect(await findAccount(db, `Bearer ${rotated!.token}`)).toBeNull();
  });

  it('limits repeated invalid passwords', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await login(db, 'unknown@example.com', 'incorrect', 'rate-test-ip')).toMatchObject({ status: 401 });
    }
    expect(await login(db, 'unknown@example.com', 'incorrect', 'rate-test-ip')).toMatchObject({ status: 429 });
  });
});
