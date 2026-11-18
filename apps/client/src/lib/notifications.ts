// Desktop/browser notifications for new messages and for messages in a meeting's chat.
// Web and the Windows app (Electron) use the browser Notification API. The Android app has no
// notifications yet: that needs a native module (expo-notifications) and a new APK.
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Dimensions, Platform } from 'react-native';

import { WIDE_BREAKPOINT } from '@/theme';

export type NotifySettings = {
  /** New messages in chats that aren't open (muted chats never notify). */
  messages: boolean;
  /** Show the message text in the notification (off: only who wrote). */
  preview: boolean;
  /** Messages in a call's / meeting's chat while the window is in the background. */
  meetings: boolean;
};

const KEY = 'flock.notify';
const DEFAULTS: NotifySettings = { messages: true, preview: true, meetings: true };

export const notificationsSupported = Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;

function load(): NotifySettings {
  if (!notificationsSupported) return DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotifySettings> | null;
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
let permission: NotificationPermission | 'unsupported' = notificationsSupported ? Notification.permission : 'unsupported';
let snapshot = { settings, permission };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { settings, permission };
  listeners.forEach((fn) => fn());
};

export function setNotifySetting<K extends keyof NotifySettings>(key: K, value: NotifySettings[K]) {
  settings = { ...settings, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  emit();
  // Turning something on is the moment to ask the browser for permission.
  if (value === true && permission === 'default') void requestNotificationPermission();
}

export async function requestNotificationPermission() {
  if (!notificationsSupported) return 'unsupported' as const;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = Notification.permission;
  }
  emit();
  return permission;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function useNotifySettings() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

const windowActive = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

function show(title: string, body: string, tag: string, onClick?: () => void) {
  if (!notificationsSupported || permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker: skip quietly.
  }
}

/** A new message arrived in a chat that isn't on screen (or the window is in the background). */
export function notifyMessage(opts: { conversationId: string; title: string; sender: string | null; text: string; open: boolean; muted: boolean }) {
  if (!settings.messages || opts.muted) return;
  if (opts.open && windowActive()) return;
  const who = opts.sender ? `${opts.sender}: ` : '';
  const body = settings.preview ? `${who}${opts.text}` : opts.sender ?? '';
  show(opts.title, body.slice(0, 180), `chat-${opts.conversationId}`, () => {
    const wide = Dimensions.get('window').width >= WIDE_BREAKPOINT;
    if (wide) router.navigate({ pathname: '/', params: { c: opts.conversationId } });
    else router.push(`/chat/${opts.conversationId}`);
  });
}

/** A message in the call/meeting chat while the window is in the background. */
export function notifyCallChat(opts: { title: string; author: string | null; text: string }) {
  if (!settings.meetings || windowActive()) return;
  const body = settings.preview ? `${opts.author ? `${opts.author}: ` : ''}${opts.text}` : (opts.author ?? '');
  show(opts.title, body.slice(0, 180), 'call-chat');
}
