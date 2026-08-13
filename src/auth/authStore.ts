import { create } from 'zustand';
import {
  getToken,
  setToken,
  clearAllTokens,
  setRefreshToken,
  getRefreshToken,
  fetchWithTimeout,
} from '../lib/api';
import { apiUrl } from '../lib/apiUrl';

export type UserRole = 'user' | 'creator' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

interface AuthState {
  user: User | null;
  initState: 'idle' | 'loading' | 'ready';
  initError: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  logout: () => void;
  isAdmin: () => boolean;
  isCreator: () => boolean;
  refreshUser: () => Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AUTH_TIMEOUT_MS = 15_000;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initState: 'idle',
  initError: null,

  init: async () => {
    const token = getToken();
    if (!token) {
      set({ initState: 'ready', user: null });
      return;
    }
    set({ initState: 'loading', initError: null });
    try {
      const res = await fetchWithTimeout(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      }, AUTH_TIMEOUT_MS);
      if (res.ok) {
        const data = (await res.json()) as { user: User };
        set({
          user: data.user,
          initState: 'ready',
          initError: null,
        });
      } else if (res.status === 401) {
        // Access token expired — try refresh
        const rt = getRefreshToken();
        if (rt) {
          try {
            const refreshRes = await fetchWithTimeout(apiUrl('/api/auth/refresh'), {
              method: 'POST',
              headers: JSON_HEADERS,
              body: JSON.stringify({ refreshToken: rt }),
            }, AUTH_TIMEOUT_MS);
            if (refreshRes.ok) {
              const refreshData = (await refreshRes.json()) as {
                token?: string;
                refreshToken?: string;
              };
              if (refreshData.token && refreshData.refreshToken) {
                setToken(refreshData.token);
                setRefreshToken(refreshData.refreshToken);
                const meRes = await fetchWithTimeout(apiUrl('/api/auth/me'), {
                  headers: { Authorization: `Bearer ${refreshData.token}` },
                }, AUTH_TIMEOUT_MS);
                if (meRes.ok) {
                  const meData = (await meRes.json()) as { user: User };
                  set({ user: meData.user, initState: 'ready', initError: null });
                  return;
                }
              }
            }
          } catch {
            /* refresh failed */
          }
        }
        clearAllTokens();
        set({ user: null, initState: 'ready', initError: null });
      } else {
        clearAllTokens();
        set({ user: null, initState: 'ready', initError: null });
      }
    } catch {
      clearAllTokens();
      set({ user: null, initState: 'ready', initError: null });
    }
  },

  login: async (email, password) => {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password }),
      }, AUTH_TIMEOUT_MS);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: User;
        token?: string;
        refreshToken?: string;
      };
      if (!res.ok) {
        return { error: data.error || 'Login failed' };
      }
      if (!data.token || !data.user) {
        return { error: 'Invalid response from server' };
      }
      setToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      set({ user: data.user });
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Login failed' };
    }
  },

  signup: async (email, password, name) => {
    try {
      const res = await fetchWithTimeout(apiUrl('/api/auth/signup'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password, name: name || '' }),
      }, AUTH_TIMEOUT_MS);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: User;
        token?: string;
        refreshToken?: string;
      };
      if (!res.ok) {
        return { error: data.error || 'Registration failed' };
      }
      if (!data.token || !data.user) {
        return { error: 'Invalid response from server' };
      }
      setToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      set({ user: data.user });
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Registration failed' };
    }
  },

  logout: () => {
    const rt = getRefreshToken();
    if (rt) {
      fetchWithTimeout(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ refreshToken: rt }),
      }, AUTH_TIMEOUT_MS).catch(() => {});
    }
    clearAllTokens();
    set({ user: null });
  },

  isAdmin: () => get().user?.role === 'admin',
  isCreator: () => get().user?.role === 'creator',
  refreshUser: async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetchWithTimeout(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      }, AUTH_TIMEOUT_MS);
      if (res.ok) {
        const data = (await res.json()) as { user: User };
        set({ user: data.user });
      } else {
        clearAllTokens();
        set({ user: null });
      }
    } catch {
      clearAllTokens();
      set({ user: null });
    }
  },
}));
