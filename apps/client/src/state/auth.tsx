import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setAuthToken, setUnauthorizedHandler } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import type { User } from '@/lib/types';
import { chatStore } from './chat-store';

const TOKEN_KEY = 'flock.token';

type AuthState = {
  ready: boolean;
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'displayName' | 'bio' | 'title'>>) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const applySession = useCallback(async (nextToken: string | null, nextUser: User | null) => {
    setAuthToken(nextToken);
    await setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken && nextUser) chatStore.start(nextToken, nextUser);
    else chatStore.stop();
  }, []);

  const logout = useCallback(() => applySession(null, null), [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    (async () => {
      const saved = await getItem(TOKEN_KEY);
      if (saved) {
        setAuthToken(saved);
        try {
          await applySession(saved, await api.me());
        } catch (e: any) {
          // Keep the session when the server is merely unreachable; drop it when rejected.
          if (e?.status === 401) await applySession(null, null);
          else setToken(saved);
        }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
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
        if (chatStore.me) chatStore.me = next;
      },
    }),
    [ready, user, token, applySession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
