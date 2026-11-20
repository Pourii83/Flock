// Notifications for new messages, incoming calls and messages in a call's chat.
// - Browsers and the installed PWA: Web Push. The server sends each message to this device's push
//   subscription, so it arrives even when Flock is closed or the phone put it to sleep; the service
//   worker (public/sw.js) shows it. While the app is open and in front, nothing pops up.
// - Where push isn't available (the Windows app, some browsers): the page shows the notification
//   itself while it is open, through the service worker when there is one (Chrome on Android only
//   allows that) or the Notification API.
// The Android app has no notifications yet: that needs a native module and a new APK.
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Dimensions, Platform } from 'react-native';

import { WIDE_BREAKPOINT } from '@/theme';
import { api } from './api';
import { getLang } from './i18n';

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
  // The server writes the push notifications: tell it what this device wants.
  void syncPush();
}

export async function requestNotificationPermission() {
  if (!notificationsSupported) return 'unsupported' as const;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = Notification.permission;
  }
  emit();
  void syncPush();
  return permission;
}

// ---------- Web Push ----------

const PUSH_KEY = 'flock.push';
/** This device's push subscription is registered with the server (page notifications then stay quiet). */
let pushActive = (() => {
  try {
    return notificationsSupported && !!localStorage.getItem(PUSH_KEY);
  } catch {
    return false;
  }
})();

const pushSupported = () =>
  notificationsSupported && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window;

function base64ToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Subscribes this device to push (or drops the subscription when message notifications are off).
 * Called after sign-in, when permission is granted and when a setting changes. Never throws.
 */
export async function syncPush() {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    if (!settings.messages || permission !== 'granted') {
      if (current) {
        await api.pushUnsubscribe(current.endpoint).catch(() => {});
        await current.unsubscribe().catch(() => {});
      }
      pushActive = false;
      localStorage.removeItem(PUSH_KEY);
      return;
    }
    const { publicKey } = await api.pushKey();
    if (!publicKey) return;
    let subscription = current;
    // A subscription made for another server key can't be used: replace it.
    const key = subscription?.options?.applicationServerKey;
    if (subscription && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/=+$/, '') !== btoa(String.fromCharCode(...base64ToBytes(publicKey))).replace(/=+$/, '')) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) as BufferSource });
    await api.pushSubscribe(subscription.toJSON(), settings.preview, getLang());
    pushActive = true;
    localStorage.setItem(PUSH_KEY, subscription.endpoint);
  } catch (error) {
    // No push service (blocked network, a browser without one): page notifications still work.
    console.warn('[flock] push subscription failed', error);
    pushActive = false;
    try {
      localStorage.removeItem(PUSH_KEY);
    } catch {}
  }
}

/** Signing out: this device stops receiving that account's notifications. */
export async function dropPush({ tellServer = true }: { tellServer?: boolean } = {}) {
  if (!pushSupported()) return;
  try {
    // Not serviceWorker.ready: with no worker registered (dev server, a browser that refused it) it
    // never settles, and signing out would hang forever.
    const registration = await navigator.serviceWorker.getRegistration();
    const current = await registration?.pushManager.getSubscription();
    if (current) {
      // A rejected (expired) session can't tell the server; the server drops dead endpoints itself.
      if (tellServer) await api.pushUnsubscribe(current.endpoint).catch(() => {});
      await current.unsubscribe().catch(() => {});
    }
  } catch {}
  pushActive = false;
  try {
    localStorage.removeItem(PUSH_KEY);
  } catch {}
}

/** Opens a conversation (a tapped notification). */
export function openConversationFromNotification(conversationId: string) {
  const wide = Dimensions.get('window').width >= WIDE_BREAKPOINT;
  if (wide) router.navigate({ pathname: '/', params: { c: conversationId } });
  else router.push(`/chat/${conversationId}`);
}

// The service worker asks an open window to show the chat whose notification was tapped.
if (notificationsSupported && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; conversationId?: string } | null;
    if (data?.type === 'flock-open' && data.conversationId) openConversationFromNotification(data.conversationId);
  });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function useNotifySettings() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

const windowActive = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

async function show(title: string, body: string, tag: string, conversationId?: string) {
  if (!notificationsSupported || permission !== 'granted') return;
  const options = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { conversationId: conversationId ?? null } };
  // Desktop browsers and the Windows app: a page notification. Chrome on Android refuses that
  // (`new Notification()` throws there), so it goes through the service worker, whose click handler
  // then opens the chat.
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      if (conversationId) openConversationFromNotification(conversationId);
      n.close();
    };
    return;
  } catch {}
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    await registration?.showNotification(title, options);
  } catch {}
}

/** A new message arrived in a chat that isn't on screen (or the window is in the background). */
export function notifyMessage(opts: { conversationId: string; title: string; sender: string | null; text: string; open: boolean; muted: boolean }) {
  if (!settings.messages || opts.muted) return;
  // With push on, the server's notification covers it (and the service worker skips it while the
  // app is in front); showing one here too would ring twice.
  if (pushActive) return;
  if (opts.open && windowActive()) return;
  const who = opts.sender ? `${opts.sender}: ` : '';
  const body = settings.preview ? `${who}${opts.text}` : (opts.sender ?? '');
  void show(opts.title, body.slice(0, 180), `chat-${opts.conversationId}`, opts.conversationId);
}

/** A message in the call/meeting chat while the window is in the background. */
export function notifyCallChat(opts: { title: string; author: string | null; text: string }) {
  if (!settings.meetings || windowActive()) return;
  const body = settings.preview ? `${opts.author ? `${opts.author}: ` : ''}${opts.text}` : (opts.author ?? '');
  void show(opts.title, body.slice(0, 180), 'call-chat');
}
