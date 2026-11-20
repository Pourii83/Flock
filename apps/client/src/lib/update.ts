// Update detection: compares the version the server is serving with the version of this client
// bundle, and remembers which version the user has already seen so the changelog can appear once
// after an update. Installed apps compare numeric versions; the web bundle built by the server
// package embeds the exact package version (EXPO_PUBLIC_BUILD_VERSION), so hotfix deploys that keep
// the same number still show the update box.
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';

import { api } from './api';
import { getRepoUrl } from './brand';
import { getItem, setItem } from './storage';

/** Exact version baked into a web bundle by scripts/package-server.sh ('' for local builds). */
const BUILD_VERSION = String(process.env.EXPO_PUBLIC_BUILD_VERSION ?? '').trim();
/** Version of the running client bundle: the package build, or the Expo app config version. */
export const CLIENT_VERSION = BUILD_VERSION || Constants.expoConfig?.version || '0.0.0';

/** How often the app asks the server for its version while it stays open. */
const POLL_MS = 5 * 60 * 1000;
/** Last client version the user has seen (localStorage/SecureStore). */
const SEEN_KEY = 'flock.seenVersion';
/** Server build this device already updated to (stops the update box from coming back). */
const DISMISSED_KEY = 'flock.updatedTo';

type UpdateState = {
  /** Installed server version, or null until the first successful check. */
  version: string | null;
  /** Changelog text shipped with the server package (plain lines; may be empty). */
  notes: string;
  /** Persian changelog when the package ships one. */
  notesFa: string;
  /** A check has finished (successfully or not). */
  checked: boolean;
};

let state: UpdateState = { version: null, notes: '', notesFa: '', checked: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Numeric segments of a version: "v1.9.0-1-g827c5c7" -> [1, 9, 0]. */
export function versionSegments(version: string | null | undefined): number[] {
  if (!version) return [];
  const match = /(\d+(?:\.\d+)*)/.exec(String(version).replace(/^v/i, ''));
  return match ? match[1]!.split('.').map((n) => Number(n)) : [];
}

/** True when `candidate` is a newer version than `base`. */
export function isNewerVersion(candidate: string | null | undefined, base: string | null | undefined): boolean {
  const next = versionSegments(candidate);
  if (!next.length) return false;
  const current = versionSegments(base);
  for (let i = 0; i < Math.max(next.length, current.length); i += 1) {
    const a = next[i] ?? 0;
    const b = current[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * "v1.11.0-3-gab12cd" -> { numbers: "1.11.0", build: "3-gab12cd" }.
 * The leading "v" is cosmetic: the server writes its tag (`v1.11.0`) while the app config has the
 * bare number (`1.11.0`), so the two must compare as the same release.
 */
function buildParts(version: string | null | undefined): { numbers: string; build: string } {
  const text = String(version ?? '').trim().replace(/^v/i, '');
  const match = /^(\d+(?:\.\d+)*)(?:[-+](.*))?$/.exec(text);
  if (!match) return { numbers: text.toLowerCase(), build: '' };
  return { numbers: match[1]!, build: (match[2] ?? '').toLowerCase() };
}

/**
 * Is the server serving a different build than this client?
 * - A newer numeric version is always an update (installed apps need the new release, the web gets
 *   the new bundle).
 * - The same numeric version with a different build id behind it (a hotfix deploy) is an update on
 *   the web only, where a reload picks the new bundle up.
 * - Anything else is the same build: "v1.11.0" and "1.11.0" are one release, never an update.
 */
export function isUpdateAvailable(serverVersion: string | null | undefined): boolean {
  if (!serverVersion) return false;
  const server = buildParts(serverVersion);
  const client = buildParts(CLIENT_VERSION);
  if (!server.numbers) return false;
  if (server.numbers !== client.numbers) return isNewerVersion(serverVersion, CLIENT_VERSION);
  if (Platform.OS !== 'web' || !BUILD_VERSION) return false;
  if (!server.build || !client.build) return false;
  return server.build !== client.build;
}

// ---------- already updated ----------
// A reload normally brings the new bundle, so the box goes away by itself. When it cannot (an
// installed PWA serving its cached build, a bundle without a build stamp) the box would otherwise
// come back every few minutes: pressing Update remembers that build once.

let dismissedBuild: string | null = null;
let dismissedLoaded = false;

/** Reads the build this device already updated to (once per launch). */
export async function loadDismissedUpdate(): Promise<string | null> {
  if (dismissedLoaded) return dismissedBuild;
  dismissedLoaded = true;
  const saved = await getItem(DISMISSED_KEY);
  dismissedBuild = typeof saved === 'string' && saved ? saved : null;
  return dismissedBuild;
}

/** Remember the server build the person updated to, so the same one never asks again. */
export async function dismissUpdate(version: string | null | undefined) {
  dismissedBuild = String(version ?? '').trim() || null;
  await setItem(DISMISSED_KEY, dismissedBuild ?? '');
}

/** True when this exact build (number + build id) is the one already updated to here. */
export function isDismissedUpdate(version: string | null | undefined): boolean {
  if (!dismissedBuild || !version) return false;
  const asked = buildParts(version);
  const saved = buildParts(dismissedBuild);
  return asked.numbers === saved.numbers && asked.build === saved.build;
}

/** The version as shown to people: numeric part only ("v1.9.0-1-g827c5c7" -> "1.9.0"). */
export function displayVersion(version: string | null | undefined): string {
  const parts = versionSegments(version);
  return parts.length ? parts.join('.') : (version ?? '');
}

/** Releases page for the installed server's version, or '' when repository links are hidden. */
export function repoReleasesUrl(version: string | null | undefined): string {
  const repo = getRepoUrl().replace(/\/+$/, '');
  if (!repo) return '';
  // Link the exact tag only when the version has no git-describe suffix behind it.
  const clean = version?.trim().replace(/^v/i, '') ?? '';
  return /^\d+\.\d+\.\d+$/.test(clean) ? `${repo}/releases/tag/v${clean}` : `${repo}/releases/latest`;
}

let inFlight: Promise<void> | null = null;

/** Asks the server for its installed version and changelog (shared between callers). */
export function refreshUpdateInfo(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = api.updateInfo().then(
    (info) => {
      const version = info.version ?? null;
      const notes = info.notes ?? '';
      const notesFa = info.notesFa ?? '';
      if (version !== state.version || notes !== state.notes || notesFa !== state.notesFa || !state.checked) {
        state = { version, notes, notesFa, checked: true };
        emit();
      }
    },
    () => {
      // Older servers have no /api/update: stay quiet and retry on the next poll.
      if (!state.checked) {
        state = { ...state, checked: true };
        emit();
      }
    },
  );
  return inFlight.finally(() => {
    inFlight = null;
  });
}

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let stopWatching: (() => void) | null = null;

/**
 * Timers are frozen while the app is in the background (phones, hidden tabs), so the poll alone can
 * miss an update for a long time: also check when the app comes back to the front or gets online.
 */
function watchForeground(): () => void {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
    const onVisible = () => {
      if (!document.hidden) void refreshUpdateInfo();
    };
    const onOnline = () => void refreshUpdateInfo();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') void refreshUpdateInfo();
  });
  return () => sub.remove();
}

/** Update state, polled on mount and every few minutes while the app stays open. */
export function useUpdateInfo(): UpdateState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      void refreshUpdateInfo();
      timer = setInterval(() => void refreshUpdateInfo(), POLL_MS);
      stopWatching = watchForeground();
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0 && timer) {
        clearInterval(timer);
        timer = null;
        stopWatching?.();
        stopWatching = null;
      }
    };
  }, []);
  return snapshot;
}

// ---------- changelog ----------

let changelogChecked = false;

/**
 * True when this client bundle differs from the version the user last saw. The first run on a
 * device stores the current version and stays quiet, so fresh installs never see a changelog.
 */
export async function takeChangelog(): Promise<boolean> {
  if (changelogChecked) return false;
  changelogChecked = true;
  const seen = await getItem(SEEN_KEY);
  if (seen === CLIENT_VERSION) return false;
  if (seen === null) {
    await setItem(SEEN_KEY, CLIENT_VERSION);
    return false;
  }
  return true;
}

/** Remembers the running version so the changelog shows once. */
export async function markChangelogSeen() {
  await setItem(SEEN_KEY, CLIENT_VERSION);
}
