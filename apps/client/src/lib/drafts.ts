// Per-conversation composer drafts. Kept in memory (so switching chats is instant) and persisted
// through lib/storage (localStorage on web/desktop, SecureStore on native) with a short debounce.
import { useSyncExternalStore } from 'react';

import { getItem, setItem } from './storage';

const KEY = 'flock.drafts';
const MAX_ENTRIES = 100;
const MAX_LENGTH = 10_000;
const SAVE_DELAY = 400;

export type Drafts = Record<string, string>;

let drafts: Drafts = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

const sanitize = (value: unknown): Drafts => {
  if (!value || typeof value !== 'object') return {};
  const out: Drafts = {};
  for (const [id, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === 'string' && text.length > 0) out[id] = text.slice(0, MAX_LENGTH);
  }
  return out;
};

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await getItem(KEY);
    // Anything typed before storage finished loading wins over the stored copy.
    if (raw) drafts = { ...sanitize(JSON.parse(raw)), ...drafts };
  } catch {
    // Corrupt or unavailable storage: start empty.
  }
  emit();
}

void load();

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const entries = Object.entries(drafts);
    // Drop the oldest conversations if the map grows too large.
    const trimmed = entries.length > MAX_ENTRIES ? Object.fromEntries(entries.slice(-MAX_ENTRIES)) : drafts;
    // Storage may be unavailable or size-limited (native keystore): drafts must never break the app.
    void Promise.resolve(setItem(KEY, Object.keys(trimmed).length ? JSON.stringify(trimmed) : null)).catch(() => {});
  }, SAVE_DELAY);
}

export const getDraft = (conversationId: string): string => drafts[conversationId] ?? '';

export function setDraft(conversationId: string, text: string) {
  const value = text.slice(0, MAX_LENGTH);
  if ((drafts[conversationId] ?? '') === value) return;
  if (value) drafts = { ...drafts, [conversationId]: value };
  else {
    if (!(conversationId in drafts)) return;
    const next = { ...drafts };
    delete next[conversationId];
    drafts = next;
  }
  emit();
  scheduleSave();
}

export function clearDraft(conversationId: string) {
  setDraft(conversationId, '');
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Current draft for a conversation; re-renders when it changes or when storage finishes loading. */
export function useDraft(conversationId: string): string {
  return useSyncExternalStore(
    subscribe,
    () => drafts[conversationId] ?? '',
    () => drafts[conversationId] ?? '',
  );
}
