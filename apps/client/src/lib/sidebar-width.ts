// Width of the desktop list column (Chats, Calls and Contacts share it), resizable by dragging its
// edge and remembered between launches.
import { useSyncExternalStore } from 'react';

import { getItem, setItem } from './storage';

export const SIDEBAR_MIN = 300;
export const SIDEBAR_MAX = 520;
export const SIDEBAR_DEFAULT = 380;
const KEY = 'flock.sidebarWidth';

let width = SIDEBAR_DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

export const clampSidebar = (value: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value)));

function emit() {
  listeners.forEach((fn) => fn());
}

function load() {
  if (loaded) return;
  loaded = true;
  void getItem(KEY).then((saved) => {
    const n = Number(saved);
    if (Number.isFinite(n) && n > 0 && clampSidebar(n) !== width) {
      width = clampSidebar(n);
      emit();
    }
  });
}

/** Live while dragging; `save` persists it (on release). */
export function setSidebarWidth(next: number, save = false) {
  const clamped = clampSidebar(next);
  if (clamped !== width) {
    width = clamped;
    emit();
  }
  if (save) void setItem(KEY, String(width));
}

export const getSidebarWidth = () => width;

export function useSidebarWidth() {
  load();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => width,
    () => width,
  );
}
