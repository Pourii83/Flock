// Update detection: compares the version the server is serving with the version of this client
// bundle, and remembers which version the user has already seen so the changelog can appear once
// after an update. Versions are compared tolerantly: a leading "v" and git-describe suffixes
// ("v1.9.0-1-g827c5c7") are ignored, only the numeric segments matter.
import Constants from 'expo-constants';
import { useEffect, useSyncExternalStore } from 'react';

import { api } from './api';
import { getRepoUrl } from './brand';
import { getItem, setItem } from './storage';

/** Version of the running client bundle (Expo app config). */
export const CLIENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** How often the app asks the server for its version while it stays open. */
const POLL_MS = 5 * 60 * 1000;
/** Last client version the user has seen (localStorage/SecureStore). */
const SEEN_KEY = 'flock.seenVersion';

type UpdateState = {
  /** Installed server version, or null until the first successful check. */
  version: string | null;
  /** Changelog text shipped with the server package (plain lines; may be empty). */
  notes: string;
  /** A check has finished (successfully or not). */
  checked: boolean;
};

let state: UpdateState = { version: null, notes: '', checked: false };
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
      if (version !== state.version || notes !== state.notes || !state.checked) {
        state = { version, notes, checked: true };
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
