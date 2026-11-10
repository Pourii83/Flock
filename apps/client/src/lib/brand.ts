// Brand settings an admin can change (app name, repository link) live here as a tiny store so
// already-translated copy can swap the old brand name without touching every string.
// No imports besides React: i18n.ts imports this module, and api.ts imports i18n.ts.
import { useSyncExternalStore } from 'react';

export type Branding = {
  appName: string;
  repoUrl: string;
  showRepoLinks: boolean;
  /** Version of the server package serving this build. */
  version: string | null;
};

export const DEFAULT_REPO = 'https://github.com/Pourii83/Flock';
const DEFAULT: Branding = { appName: 'Flock', repoUrl: DEFAULT_REPO, showRepoLinks: true, version: null };

let branding: Branding = DEFAULT;
const listeners = new Set<() => void>();

export const getBranding = () => branding;
export const getAppName = () => branding.appName;
/** The repository URL, or '' when an admin hid repo links. */
export const getRepoUrl = () => (branding.showRepoLinks ? branding.repoUrl : '');
export const getBrandVersion = () => branding.version;

export function setBranding(patch: Partial<Branding>) {
  const appName = (patch.appName ?? branding.appName).trim().slice(0, 40);
  branding = {
    ...branding,
    ...patch,
    appName: appName || DEFAULT.appName,
    repoUrl: (patch.repoUrl ?? branding.repoUrl).trim() || DEFAULT.repoUrl,
    // Never accept a repo URL when links were hidden.
    showRepoLinks: typeof patch.showRepoLinks === 'boolean' ? patch.showRepoLinks : branding.showRepoLinks,
  };
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export function useBranding() {
  return useSyncExternalStore(subscribe, getBranding, getBranding);
}

/**
 * Swaps the hard-coded brand inside UI copy for the admin's app name, in both scripts.
 * With the default name this is a no-op (Persian «فلاک» stays Persian).
 */
export function brandText(text: string): string {
  const name = branding.appName;
  if (name === DEFAULT.appName) return text;
  return text.split('Flock').join(name).split('فلاک').join(name);
}
