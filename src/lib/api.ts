import { apiUrl } from './apiUrl';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_WRITE_TIMEOUT_MS = 120_000;
const AUTH_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'RequestTimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_READ_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAllTokens(): void {
  clearToken();
  clearRefreshToken();
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Deduplicates concurrent refresh attempts.
 * Returns true if refresh succeeded, false otherwise.
 */
async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetchWithTimeout(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }, AUTH_TIMEOUT_MS);
      if (!res.ok) {
        clearAllTokens();
        return false;
      }
      const data = (await res.json()) as { token?: string; refreshToken?: string };
      if (data.token && data.refreshToken) {
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        return true;
      }
      clearAllTokens();
      return false;
    } catch {
      clearAllTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = options.method && options.method !== 'GET'
      ? DEFAULT_WRITE_TIMEOUT_MS
      : DEFAULT_READ_TIMEOUT_MS,
    ...requestOptions
  } = options;
  const token = getToken();
  const headers: HeadersInit = {
    ...(requestOptions.headers as Record<string, string>),
  };
  if (import.meta.env.DEV && !(headers as Record<string, string>)['x-easyposter-owner']) {
    (headers as Record<string, string>)['x-easyposter-owner'] = 'local-user@easyposter.test';
  }
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetchWithTimeout(
    apiUrl(url),
    { ...requestOptions, headers },
    timeoutMs
  );

  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      const newToken = getToken();
      const retryHeaders: HeadersInit = {
        ...(requestOptions.headers as Record<string, string>),
      };
      if (import.meta.env.DEV && !(retryHeaders as Record<string, string>)['x-easyposter-owner']) {
        (retryHeaders as Record<string, string>)['x-easyposter-owner'] = 'local-user@easyposter.test';
      }
      if (newToken) {
        (retryHeaders as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      }
      return fetchWithTimeout(
        apiUrl(url),
        { ...requestOptions, headers: retryHeaders },
        timeoutMs
      );
    }
  }

  return res;
}
