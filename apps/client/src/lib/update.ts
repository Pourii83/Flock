// Update detection: compares the version the server is serving with the version of this client
// bundle, and remembers which version the user has already seen so the changelog can appear once
// after an update. Installed apps compare numeric versions; the web bundle built by the server
// package embeds the exact package version (EXPO_PUBLIC_BUILD_VERSION), so hotfix deploys that keep
// the same number still show the update box.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
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
 * Is the server serving a different build than this client?
 * - Web served by the Flock server: the bundle is stamped with the package version, so any change
 *   (including a hotfix such as "v1.9.0-4-gf8ad187") means a reload is available.
 * - Installed apps: only a real numeric version bump is an update (they need a new release).
 */
export function isUpdateAvailable(serverVersion: string | null | undefined): boolean {
  if (!serverVersion) return false;
  if (Platform.OS === 'web' && BUILD_VERSION) return String(serverVersion) !== CLIENT_VERSION;
  return isNewerVersion(serverVersion, CLIENT_VERSION);
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

/** Update state, polled on mount and every few minutes while the app stays open. */
export function useUpdateInfo(): UpdateState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      void refreshUpdateInfo();
      timer = setInterval(() => void refreshUpdateInfo(), POLL_MS);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0 && timer) {
        clearInterval(timer);
        timer = null;
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
