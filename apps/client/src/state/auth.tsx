import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setAuthToken, setUnauthorizedHandler } from '@/lib/api';
import { getApiUrl, loadServerUrl, setServerUrl } from '@/lib/config';
import { getItem, setItem } from '@/lib/storage';
import type { User } from '@/lib/types';
import { chatStore } from './chat-store';

const TOKEN_KEY = 'flock.token';
/** The signed-in profile, so the app can open without a connection instead of asking to sign in again. */
const USER_KEY = 'flock.user';
const RETRY_MS = 15000;

type AuthState = {
  ready: boolean;
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'displayName' | 'bio' | 'title' | 'username'>>) => Promise<void>;
  /** Uploads a base64 JPEG as the profile photo, or removes it when null. */
  setAvatar: (base64: string | null) => Promise<void>;
  /** Switches to another Flock server; the current session belongs to the old one, so it signs out. */
  changeServer: (url: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const applySession = useCallback(async (nextToken: string | null, nextUser: User | null) => {
    setAuthToken(nextToken);
    await setItem(TOKEN_KEY, nextToken);
    await setItem(USER_KEY, nextToken && nextUser ? JSON.stringify(nextUser) : null);
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken && nextUser) chatStore.start(nextToken, nextUser);
    else chatStore.stop();
  }, []);

  const logout = useCallback(() => applySession(null, null), [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      await loadServerUrl();
      const saved = await getItem(TOKEN_KEY);
      if (saved && getApiUrl()) {
        setAuthToken(saved);
        try {
          await applySession(saved, await api.me());
        } catch (e: any) {
          // Keep the session when the server is merely unreachable; drop it when rejected.
          if (e?.status === 401) await applySession(null, null);
          else {
            const cached = parseUser(await getItem(USER_KEY));
            if (cached) {
              // Offline: open the app as the last known user; the chat socket reconnects by itself
              // and the profile is refreshed once the server answers.
              await applySession(saved, cached);
              const refresh = async () => {
                if (cancelled) return;
                try {
                  const fresh = await api.me();
                  if (cancelled) return;
                  setUser(fresh);
                  chatStore.updateUser(fresh);
                  await setItem(USER_KEY, JSON.stringify(fresh));
                } catch (err: any) {
                  if (err?.status === 401) await applySession(null, null);
                  else if (!cancelled) retry = setTimeout(refresh, RETRY_MS);
                }
              };
              retry = setTimeout(refresh, RETRY_MS);
            } else setToken(saved);
          }
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      setUnauthorizedHandler(null);
    };
  }, [applySession, logout]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      token,
      login: async (username, password) => {
        const res = await api.login(username.trim(), password);
        await applySession(res.token, res.user);
      },
      register: async (username, displayName, password) => {
        const res = await api.register(username.trim(), displayName.trim(), password);
        await applySession(res.token, res.user);
      },
      logout,
      updateProfile: async (patch) => {
        const next = await api.updateMe(patch);
        setUser(next);
        chatStore.updateUser(next);
        await setItem(USER_KEY, JSON.stringify(next));
      },
      setAvatar: async (base64) => {
        const next = base64 ? await api.setAvatar(base64) : await api.removeAvatar();
        setUser(next);
        chatStore.updateUser(next);
        await setItem(USER_KEY, JSON.stringify(next));
      },
      changeServer: async (url) => {
        await applySession(null, null);
        await setServerUrl(url);
      },
    }),
    [ready, user, token, applySession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return user && typeof user.id === 'string' ? (user as User) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
