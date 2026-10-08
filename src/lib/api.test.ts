import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aiBillingFetch, AI_COST_EVENT } from '../billing/aiBillingFetch';
import {
  getToken,
  setToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  clearAllTokens,
  apiFetch,
  fetchWithTimeout,
  RequestTimeoutError,
} from './api';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('token getters/setters', () => {
  it('getToken returns null when not set', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken / getToken round-trips', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc123');
  });

  it('clearToken removes the token', () => {
    setToken('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('getRefreshToken returns null when not set', () => {
    expect(getRefreshToken()).toBeNull();
  });

  it('setRefreshToken / getRefreshToken round-trips', () => {
    setRefreshToken('rt_xyz');
    expect(getRefreshToken()).toBe('rt_xyz');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt_xyz');
  });

  it('clearRefreshToken removes the refresh token', () => {
    setRefreshToken('rt_xyz');
    clearRefreshToken();
    expect(getRefreshToken()).toBeNull();
  });

  it('clearAllTokens removes both tokens', () => {
    setToken('access');
    setRefreshToken('refresh');
    clearAllTokens();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('adds Authorization header when token is present', async () => {
    setToken('my-token');

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer my-token');
  });

  it('does not add Authorization header when no token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/test');

    const [, options] = mockFetch.mock.calls[0];
    expect(new Headers(options.headers).get('Authorization')).toBeNull();
  });

  it('retries with new token on 401 when refresh succeeds', async () => {
    setToken('expired-token');
    setRefreshToken('valid-refresh');

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/refresh')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ token: 'new-access', refreshToken: 'new-refresh' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(200);
    expect(getToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('clears tokens when refresh fails', async () => {
    setToken('expired-token');
    setRefreshToken('bad-refresh');

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/refresh')) {
        return Promise.resolve(new Response('Forbidden', { status: 403 }));
      }
      return Promise.resolve(new Response('Unauthorized', { status: 401 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('does not attempt refresh when no refresh token exists', async () => {
    setToken('expired-token');

    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await apiFetch('/api/data');

    expect(res.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWithTimeout', () => {
  it('aborts a stalled request at the configured deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      })
    );

    const request = fetchWithTimeout('/stalled', {}, 250);
    const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('preserves caller cancellation instead of reporting a timeout', async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      })
    );

    const request = fetchWithTimeout('/cancelled', { signal: caller.signal }, 5_000);
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});


it.each(['object', 'Headers', 'tuples'])('preserves %s request headers and body through an auth refresh', async kind => {
  setToken('expired');
  setRefreshToken('refresh');
  const entries: [string, string][] = [['Content-Type', 'application/json'], ['x-ai-max-credits', '22']];
  const headers: HeadersInit = kind === 'Headers' ? new Headers(entries) : kind === 'tuples' ? entries : Object.fromEntries(entries);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(Response.json({ token: 'renewed', refreshToken: 'new-refresh' }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  const body = JSON.stringify({ reference: 'poster' });
  expect((await apiFetch('/api/ai/poster-reconstruction', { method: 'POST', headers, body })).ok).toBe(true);
  for (const index of [0, 2]) {
    const options = fetchMock.mock.calls[index][1] as RequestInit;
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(options.headers).get('x-ai-max-credits')).toBe('22');
    expect(new Headers(options.headers).get('Authorization')).toBe(index === 0 ? 'Bearer expired' : 'Bearer renewed');
    expect(options.body).toBe(body);
  }
  expect(new Headers(headers).has('Authorization')).toBe(false);
});

it('sends the billing preview and actual generation as JSON with the quoted credit cap', async () => {
  setToken('test-token');
  const body = JSON.stringify({ reference: 'poster' });
  const notices: string[] = [];
  const listener = (event: Event) => notices.push((event as CustomEvent).detail.message);
  window.addEventListener(AI_COST_EVENT, listener);
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(options.body).toBe(body);
    if (url.endsWith('?estimate=1')) return Response.json({ estimate: { maximumCredits: 22, tier: 'paid', limited: false } });
    expect(headers.get('x-ai-max-credits')).toBe('22');
    expect(notices.at(-1)).toContain('up to 22 pay-as-you-go credits');
    return Response.json({ billing: { credits: 21 } });
  }));
  try {
    const response = await aiBillingFetch('/api/ai/poster-reconstruction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(await response.json()).toEqual({ billing: { credits: 21 } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(notices.at(-1)).toBe('AI step complete · 21 credits used.');
  } finally { window.removeEventListener(AI_COST_EVENT, listener); }
});
