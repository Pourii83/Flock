// Server update checks: GitHub Releases are the source of truth for an installed server (not
// commits). The admin panel compares the latest release tag with the installed numeric release and
// can start a self-update; the actual download/install runs in a detached systemd unit so restarting
// the Flock service never kills the updater.
import fs from 'node:fs/promises';
import path from 'node:path';

import { installedVersion } from './version.js';

const REPO = process.env.FLOCK_REPO || 'Pourii83/Flock';
const CACHE_MS = 10 * 60 * 1000;
// Must match PathExists= in deploy/flock-self-update.path (StateDirectory=flock → /var/lib/flock).
const REQUEST_FILE = path.join(process.env.FLOCK_STATE_DIR || '/var/lib/flock', 'self-update-request');

/** @typedef {{ tag: string, name: string, notes: string, url: string, publishedAt: string | null }} Release */
/** @type {{ at: number, release: Release | null }} */
let cache = { at: 0, release: null };

/** Numeric segments: "v1.9.1" -> [1,9,1], "v1.9.0-8-gabc" -> [1,9,0]. */
function segments(version) {
  if (!version) return [];
  const match = /(\d+(?:\.\d+)*)/.exec(String(version).replace(/^v/i, ''));
  return match ? match[1].split('.').map(Number) : [];
}

/** True when `candidate` is a newer release than `base`. */
export function isNewerRelease(candidate, base) {
  const next = segments(candidate);
  if (!next.length) return false;
  const current = segments(base);
  for (let i = 0; i < Math.max(next.length, current.length); i += 1) {
    const a = next[i] ?? 0;
    const b = current[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** @returns {Promise<Release | null>} Latest GitHub release (cached; null when unreachable). */
export async function latestRelease(force = false) {
  if (!force && cache.release && Date.now() - cache.at < CACHE_MS) return cache.release;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'flock-server' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return cache.release;
    const data = await res.json();
    const release = {
      tag: String(data.tag_name ?? ''),
      name: String(data.name ?? data.tag_name ?? ''),
      notes: String(data.body ?? '').slice(0, 4000),
      url: String(data.html_url ?? ''),
      publishedAt: data.published_at ?? null,
    };
    cache = { at: Date.now(), release };
    return release;
  } catch {
    return cache.release;
  }
}

/** What the admin panel needs: installed release vs the latest GitHub release. */
export async function serverUpdateInfo() {
  const [current, release] = await Promise.all([installedVersion(), latestRelease()]);
  const updateAvailable = !!release?.tag && isNewerRelease(release.tag, current);
  return {
    current,
    latest: release?.tag ?? null,
    updateAvailable,
    notes: release?.notes ?? '',
    url: release?.url ?? '',
    publishedAt: release?.publishedAt ?? null,
  };
}

/**
 * Asks the root-owned helper to download and install the latest release in its own systemd unit.
 * Returns quickly; the UI polls /api/branding until the version changes.
 */
export async function startSelfUpdate(tag) {
  const clean = String(tag ?? '').trim();
  if (!/^v\d+\.\d+\.\d+$/.test(clean)) return { ok: false, error: 'Invalid release tag' };
  const release = await latestRelease(true);
  if (!release?.tag || release.tag !== clean) return { ok: false, error: 'That release is not the latest on GitHub' };
  const current = await installedVersion();
  if (!isNewerRelease(clean, current)) return { ok: false, error: 'The server is already up to date' };
  // The service is unprivileged (NoNewPrivileges, so no sudo): it only drops a request file. A
  // root-owned systemd path unit (flock-self-update.path) notices it and runs the worker, in its own
  // cgroup so restarting Flock can't kill it. 'wx' refuses to overwrite a request still pending.
  try {
    await fs.writeFile(REQUEST_FILE, `${clean}\n`, { flag: 'wx', mode: 0o644 });
    return { ok: true, started: true };
  } catch (error) {
    if (error?.code === 'EEXIST') return { ok: false, error: 'An update is already in progress' };
    if (error?.code === 'ENOENT' || error?.code === 'EACCES' || error?.code === 'EROFS') {
      return { ok: false, error: 'Self-update is not available on this install' };
    }
    return { ok: false, error: 'Could not start the update' };
  }
}
