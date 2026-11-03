import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { getItem, setItem } from './storage';
import { t } from '@/lib/i18n';

const SERVER_KEY = 'flock.server';

/** Android/iOS and the Electron desktop app connect to a server the user picks. The hosted PWA uses its own origin. */
export const isInstalledApp = Platform.OS !== 'web' || (typeof window !== 'undefined' && !!(window as any).flockDesktop);

function defaultApiUrl() {
  // Desktop: only an explicit FLOCK_SERVER_URL / config.json (or localhost in --dev) arrives here.
  const desktop = typeof window !== 'undefined' ? (window as any).flockDesktop?.apiUrl : undefined;
  if (desktop) return String(desktop).replace(/\/$/, '');
  // Installed clients require an explicitly saved server; public builds have no private default.
  if (isInstalledApp) return '';
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location;
    // Dev server (Metro): the API runs separately on :4000. Built app: same origin serves /api and /socket.io.
    if (__DEV__ || !protocol.startsWith('http')) return `http://${hostname || 'localhost'}:4000`;
    return origin;
  }
  // Android emulator reaches the host machine on 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

// ---------- user-chosen server (installed apps) ----------

let override: string | null = null;
const listeners = new Set<() => void>();

export const getApiUrl = () => override ?? defaultApiUrl();

/** Loads the saved server address; call once before any API request. */
export async function loadServerUrl() {
  if (!isInstalledApp) return;
  override = await getItem(SERVER_KEY);
  listeners.forEach((fn) => fn());
}

export async function setServerUrl(url: string | null) {
  override = url;
  await setItem(SERVER_KEY, url);
  listeners.forEach((fn) => fn());
}

export function useServerUrl() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getApiUrl,
    getApiUrl,
  );
}

/** "chat.example.com" -> "https://chat.example.com", "192.168.1.5:4000" -> "http://192.168.1.5:4000". */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|:\d+$/.test(s);
    s = `${local ? 'http' : 'https'}://${s}`;
  }
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Throws a friendly error unless `url` answers like a Flock server. */
export async function checkServer(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error('not-flock');
  } catch (e: any) {
    throw new Error(
      e?.message === 'not-flock'
        ? t('That address is reachable but is not a Flock server.')
        : t("Can't reach {url}. Check the address and your connection.", { url }),
    );
  } finally {
    clearTimeout(timer);
  }
}
