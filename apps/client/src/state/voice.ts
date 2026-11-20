// Voice messages play through one shared audio element: the sound keeps going when the person
// switches chats, and a single bar (see components/voice-bar.tsx) can pause, seek, mute and set
// the speed for whatever is playing. Web/desktop only — native players are unchanged.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type VoiceNowPlaying = {
  /** Signed (or local blob) URL the element is playing. */
  url: string;
  /** File name or "Voice message". */
  title: string;
  /** Who sent it and when. */
  subtitle: string;
  time: number;
  length: number;
  playing: boolean;
  speed: number;
  muted: boolean;
};

export const VOICE_MIN_SPEED = 0.5;
export const VOICE_MAX_SPEED = 2.5;

let state: VoiceNowPlaying | null = null;
let element: HTMLAudioElement | null = null;
/** Chosen speed: remembered for the next voice message too. */
let speed = 1;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

function patch(next: Partial<VoiceNowPlaying>) {
  if (!state) return;
  state = { ...state, ...next };
  emit();
}

function audio(): HTMLAudioElement | null {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
  if (element) return element;
  const el = new Audio();
  el.preload = 'auto';
  el.onplay = () => patch({ playing: true });
  el.onpause = () => patch({ playing: false });
  el.onended = () => patch({ playing: false, time: 0 });
  el.ontimeupdate = () => patch({ time: el.currentTime });
  // WebM from MediaRecorder reports Infinity until the file has been read through once.
  el.onloadedmetadata = () => {
    if (Number.isFinite(el.duration)) patch({ length: el.duration });
  };
  el.ondurationchange = () => {
    if (Number.isFinite(el.duration)) patch({ length: el.duration });
  };
  element = el;
  return el;
}

export const getVoice = (): VoiceNowPlaying | null => state;

/** Plays one voice message, stopping whatever played before. */
export async function playVoice(input: { url: string; title: string; subtitle: string; length?: number }) {
  const el = audio();
  if (!el) return;
  if (state?.url === input.url) {
    if (el.paused) await el.play().catch(() => {});
    return;
  }
  state = {
    url: input.url,
    title: input.title,
    subtitle: input.subtitle,
    time: 0,
    length: input.length ?? 0,
    playing: false,
    speed,
    muted: false,
  };
  emit();
  el.src = input.url;
  el.playbackRate = speed;
  el.muted = false;
  await el.play().catch(() => {});
}

export function toggleVoice() {
  if (!element) return;
  if (element.paused) void element.play().catch(() => {});
  else element.pause();
}

export function seekVoice(fraction: number) {
  if (!element || !state?.length) return;
  element.currentTime = Math.max(0, Math.min(state.length, fraction * state.length));
  patch({ time: element.currentTime });
}

/** Jump back/forward by a few seconds (the bar's skip buttons). */
export function skipVoice(delta: number) {
  if (!element || !state) return;
  const next = Math.max(0, state.length ? Math.min(state.length, element.currentTime + delta) : element.currentTime + delta);
  element.currentTime = next;
  patch({ time: next });
}

/** 0.5× … 2.5×, continuously — kept for the next message as well. */
export function setVoiceSpeed(value: number) {
  if (!Number.isFinite(value)) return;
  speed = Math.max(VOICE_MIN_SPEED, Math.min(VOICE_MAX_SPEED, Math.round(value * 100) / 100));
  if (element) element.playbackRate = speed;
  patch({ speed });
  if (!state) emit();
}

export function setVoiceMuted(muted: boolean) {
  if (element) element.muted = muted;
  patch({ muted });
}

/** Hides the bar and stops the sound. */
export function stopVoice() {
  if (element) {
    element.pause();
    element.removeAttribute('src');
    element.load();
  }
  state = null;
  emit();
}

export const voiceSpeed = () => speed;

/** The voice message playing right now, or null (re-renders on every change). */
export function useVoice(): VoiceNowPlaying | null {
  return useSyncExternalStore(subscribe, getVoice, getVoice);
}
