// Voice messages play through one shared player: the sound keeps going when the person switches
// chats, and a single bar (see components/voice-bar.tsx) can pause, seek, mute and set the speed
// for whatever is playing. Web/desktop play through an <audio> element; phones use expo-video's
// player, which plays audio-only files too, so the same bar works on both.
import { createVideoPlayer } from 'expo-video';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { attachmentSource } from '@/lib/attachments';
import { t } from '@/lib/i18n';

export type VoiceNowPlaying = {
  /** Signed (or local blob) URL the player is playing; native players resolve it with credentials. */
  url: string;
  /** File name or "Voice message". */
  title: string;
  /** Who sent it and when. */
  subtitle: string;
  /** Where the message lives, so the bar can jump to it. */
  conversationId?: string;
  messageId?: string;
  time: number;
  length: number;
  playing: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  /** Why the last attempt to play it failed (null once it plays). */
  error: string | null;
};

export const VOICE_MIN_SPEED = 0.2;
export const VOICE_MAX_SPEED = 3;

/** Shown when the file can't be decoded or its signed link has expired. */
const FAILED = 'This voice message can’t be played. Its link may have expired.';

let state: VoiceNowPlaying | null = null;

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

// Chosen speed and volume last for the next voice message — and the next visit.
const SPEED_KEY = 'flock.voiceSpeed';
const VOLUME_KEY = 'flock.voiceVolume';

function stored(key: string): number | null {
  if (Platform.OS !== 'web') return null;
  try {
    const value = Number(globalThis.localStorage?.getItem(key));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function remember(key: string, value: number) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {}
}

const clampSpeed = (value: number) => Math.max(VOICE_MIN_SPEED, Math.min(VOICE_MAX_SPEED, Math.round(value * 10) / 10));
const clampVolume = (value: number) => Math.max(0, Math.min(1, Math.round(value * 100) / 100));

let speed = clampSpeed(stored(SPEED_KEY) ?? 1);
let volume = clampVolume(stored(VOLUME_KEY) ?? 1);

/** Where each message was left, so closing the bar and opening it again carries on (this session). */
const positions = new Map<string, number>();

function rememberPosition(url: string, at: number) {
  if (!(at > 1)) {
    positions.delete(url);
    return;
  }
  positions.set(url, at);
  if (positions.size > 20) {
    const oldest = positions.keys().next().value;
    if (oldest != null) positions.delete(oldest);
  }
}

function forgetPosition(url: string) {
  positions.delete(url);
}

// ---------- the player, web and native behind one shape ----------

type Engine = {
  load(url: string): void;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  release(): void;
  rate(value: number): void;
  volume(value: number): void;
  mute(value: boolean): void;
  position(): number;
  paused(): boolean;
};

// timeupdate fires only ~4 times a second: while playing, follow the clock often so the played part
// of the waveform glides instead of stepping. A timer, not requestAnimationFrame: frames stop in
// windows that aren't painted (and 25 updates a second is plenty).
let clock: ReturnType<typeof setInterval> | null = null;
function startClock() {
  if (clock) return;
  clock = setInterval(() => {
    if (element && !element.paused) patch({ time: element.currentTime });
  }, 40);
}
function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
}

/** A position to restore once the new file knows its length (see playVoice and retryVoice). */
let pendingResume: number | null = null;

function applyResume(engine: Engine) {
  const at = pendingResume;
  pendingResume = null;
  if (at == null) return;
  const length = state?.length ?? 0;
  engine.seek(length ? Math.min(at, Math.max(0, length - 0.5)) : at);
  patch({ time: engine.position() });
}

function fail() {
  stopClock();
  patch({ playing: false, error: t(FAILED) });
}

async function safePlay(engine: Engine) {
  try {
    await engine.play();
    patch({ error: null });
  } catch {
    fail();
  }
}

let element: HTMLAudioElement | null = null;

function webEngine(): Engine | null {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
  if (!element) {
    const el = new Audio();
    el.preload = 'auto';
    el.onplay = () => {
      patch({ playing: true, error: null });
      startClock();
    };
    el.onpause = () => {
      stopClock();
      patch({ playing: false });
    };
    el.onended = () => {
      stopClock();
      if (state) forgetPosition(state.url);
      patch({ playing: false, time: 0 });
    };
    el.ontimeupdate = () => patch({ time: el.currentTime });
    // WebM from MediaRecorder reports Infinity until the file has been read through once.
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) patch({ length: el.duration });
      if (pendingResume != null) applyResume(webEngine()!);
    };
    el.ondurationchange = () => {
      if (Number.isFinite(el.duration)) patch({ length: el.duration });
    };
    el.onerror = () => fail();
    element = el;
  }
  const el = element;
  return {
    load: (url) => {
      el.src = url;
    },
    play: () => el.play(),
    pause: () => el.pause(),
    seek: (seconds) => {
      el.currentTime = Math.max(0, seconds);
    },
    release: () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    },
    rate: (value) => {
      el.playbackRate = value;
    },
    volume: (value) => {
      el.volume = value;
    },
    mute: (value) => {
      el.muted = value;
    },
    position: () => el.currentTime,
    paused: () => el.paused,
  };
}

let video: ReturnType<typeof createVideoPlayer> | null = null;

function nativeEngine(): Engine | null {
  if (Platform.OS === 'web') return null;
  if (!video) {
    const player = createVideoPlayer(null);
    player.timeUpdateEventInterval = 0.2;
    player.addListener('playingChange', ({ isPlaying }) => {
      patch({ playing: isPlaying, ...(isPlaying ? { error: null } : null) });
    });
    player.addListener('timeUpdate', ({ currentTime }) => patch({ time: currentTime }));
    player.addListener('playToEnd', () => {
      if (state) forgetPosition(state.url);
      player.currentTime = 0;
      patch({ playing: false, time: 0 });
    });
    player.addListener('statusChange', ({ status }) => {
      if (status === 'error') fail();
      if (status === 'readyToPlay' && pendingResume != null) applyResume(nativeEngine()!);
    });
    video = player;
  }
  const player = video;
  return {
    load: (url) => player.replace(attachmentSource(url)),
    play: async () => {
      player.play();
    },
    pause: () => player.pause(),
    seek: (seconds) => {
      player.currentTime = Math.max(0, seconds);
    },
    release: () => player.pause(),
    rate: (value) => {
      player.playbackRate = value;
    },
    volume: (value) => {
      player.volume = value;
    },
    mute: (value) => {
      player.muted = value;
    },
    position: () => player.currentTime,
    paused: () => !player.playing,
  };
}

const engine = (): Engine | null => (Platform.OS === 'web' ? webEngine() : nativeEngine());

/** The player, only if something has been opened already (so the bar never creates one). */
const opened = (): Engine | null => (Platform.OS === 'web' ? (element ? webEngine() : null) : video ? nativeEngine() : null);

export const getVoice = (): VoiceNowPlaying | null => state;

/** Plays one voice message, stopping whatever played before. */
export async function playVoice(input: {
  url: string;
  title: string;
  subtitle: string;
  length?: number;
  conversationId?: string;
  messageId?: string;
}) {
  const player = engine();
  if (!player) return;
  // Tapping the message that is already loaded resumes it instead of starting over.
  if (state?.url === input.url && !state.error) {
    if (player.paused()) await safePlay(player);
    return;
  }
  state = {
    url: input.url,
    title: input.title,
    subtitle: input.subtitle,
    conversationId: input.conversationId,
    messageId: input.messageId,
    time: 0,
    length: input.length ?? 0,
    playing: false,
    speed,
    volume,
    muted: false,
    error: null,
  };
  emit();
  pendingResume = positions.get(input.url) ?? null;
  player.load(input.url);
  player.rate(speed);
  player.volume(volume);
  player.mute(false);
  await safePlay(player);
}

/** Tries the failed message once more, from where it stopped. */
export async function retryVoice() {
  if (!state) return;
  const player = engine();
  if (!player) return;
  const { url, time } = state;
  pendingResume = time > 1 ? time : null;
  state = { ...state, error: null, playing: false };
  emit();
  player.load(url);
  player.rate(speed);
  player.volume(volume);
  player.mute(false);
  await safePlay(player);
}

export function toggleVoice() {
  const player = opened();
  if (!player) return;
  if (player.paused()) void safePlay(player);
  else player.pause();
}

export function seekVoice(fraction: number) {
  const player = opened();
  if (!player || !state?.length) return;
  player.seek(Math.max(0, Math.min(state.length, fraction * state.length)));
  patch({ time: player.position() });
}

/** Jump back/forward by a few seconds (the bar's skip buttons). */
export function skipVoice(delta: number) {
  const player = opened();
  if (!player || !state) return;
  const next = Math.max(0, state.length ? Math.min(state.length, player.position() + delta) : player.position() + delta);
  player.seek(next);
  patch({ time: next });
}

/** 0.2× … 3× in tenths — kept for the next message as well. */
export function setVoiceSpeed(value: number) {
  if (!Number.isFinite(value)) return;
  speed = clampSpeed(value);
  remember(SPEED_KEY, speed);
  opened()?.rate(speed);
  patch({ speed });
  if (!state) emit();
}

/** 0…1 of the device's own volume; raising it also lifts a mute, like the call panel. */
export function setVoiceVolume(value: number) {
  if (!Number.isFinite(value)) return;
  volume = clampVolume(value);
  remember(VOLUME_KEY, volume);
  const player = opened();
  if (player) {
    player.volume(volume);
    if (volume > 0) player.mute(false);
  }
  patch({ volume, ...(volume > 0 && state?.muted ? { muted: false } : {}) });
  if (!state) emit();
}

export function setVoiceMuted(muted: boolean) {
  opened()?.mute(muted);
  patch({ muted });
}

/** Hides the bar and stops the sound; the message keeps its place for the next time it is opened. */
export function stopVoice() {
  stopClock();
  const player = opened();
  if (player && state) {
    const at = player.position();
    if (at > 1 && (!state.length || at < state.length - 0.5)) rememberPosition(state.url, at);
    player.release();
  }
  state = null;
  emit();
}

export const voiceSpeed = () => speed;

/** The voice message playing right now, or null (re-renders on every change). */
export function useVoice(): VoiceNowPlaying | null {
  return useSyncExternalStore(subscribe, getVoice, getVoice);
}
