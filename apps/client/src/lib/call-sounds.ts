// Short sounds for calls, synthesized with Web Audio — no audio files, no network.
// Web/Electron only: on native (and in browsers without Web Audio) every call here is a silent no-op
// and nothing throws. The two on/off switches live in the Call quality panel and persist in
// localStorage so they keep across calls.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type CallSoundSettings = {
  /** Tones when sending or receiving a call reaction. */
  reactionSounds: boolean;
  /** A notification when a message arrives in the call's temporary chat. */
  chatSounds: boolean;
};

const KEY = 'flock.callSounds';
const DEFAULTS: CallSoundSettings = { reactionSounds: true, chatSounds: true };

/** Read the saved switches once at startup (web/desktop only; native uses the defaults). */
function load(): CallSoundSettings {
  if (Platform.OS !== 'web') return DEFAULTS;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<CallSoundSettings> | null;
    return {
      reactionSounds: typeof saved?.reactionSounds === 'boolean' ? saved.reactionSounds : DEFAULTS.reactionSounds,
      chatSounds: typeof saved?.chatSounds === 'boolean' ? saved.chatSounds : DEFAULTS.chatSounds,
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
const listeners = new Set<() => void>();

function save(next: CallSoundSettings) {
  settings = next;
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    } catch {}
  }
  listeners.forEach((fn) => fn());
}

export const getCallSoundSettings = () => settings;

export function setReactionSounds(on: boolean) {
  if (settings.reactionSounds === on) return;
  save({ ...settings, reactionSounds: on });
}

export function setCallChatSounds(on: boolean) {
  if (settings.chatSounds === on) return;
  save({ ...settings, chatSounds: on });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The switches, with re-render on change (the Call quality panel toggles them). */
export function useCallSoundSettings() {
  return useSyncExternalStore(subscribe, getCallSoundSettings, getCallSoundSettings);
}

// ---------- the sounds ----------

/** One AudioContext for every call sound; browsers keep a few per page, so share it. */
let ctx: AudioContext | null = null;
function context(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof AudioContext === 'undefined') return null;
  if (!ctx || ctx.state === 'closed') {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // The context starts suspended until a user gesture; sounds played before that are skipped.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

type Note = { frequency: number; at: number; length: number; volume?: number; type?: OscillatorType };

/** Plays a few short notes with an attack/release envelope so nothing clicks. Never throws. */
function chime(notes: Note[]) {
  try {
    const audio = context();
    if (!audio) return;
    const start = audio.currentTime + 0.01;
    for (const note of notes) {
      const from = start + note.at;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(note.volume ?? 0.05, from + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + note.length);
      gain.connect(audio.destination);
      const osc = audio.createOscillator();
      osc.type = note.type ?? 'sine';
      osc.frequency.value = note.frequency;
      osc.connect(gain);
      osc.start(from);
      osc.stop(from + note.length + 0.02);
    }
  } catch {
    // No audio output, blocked context, a browser without Web Audio: the call carries on silently.
  }
}

/**
 * A reaction in the call: `send` is a soft rising blip for the emoji I picked,
 * `receive` a softer two-note fall for someone else's.
 */
export function playReactionSound(kind: 'send' | 'receive') {
  if (!settings.reactionSounds) return;
  if (kind === 'send') chime([{ frequency: 740, at: 0, length: 0.12, volume: 0.05 }, { frequency: 988, at: 0.07, length: 0.14, volume: 0.045 }]);
  else chime([{ frequency: 988, at: 0, length: 0.11, volume: 0.04 }, { frequency: 740, at: 0.08, length: 0.16, volume: 0.035 }]);
}

/** A message arrived in the call's temporary chat while the panel is closed. */
export function playCallChatSound() {
  if (!settings.chatSounds) return;
  chime([
    { frequency: 880, at: 0, length: 0.1, volume: 0.045 },
    { frequency: 1175, at: 0.09, length: 0.18, volume: 0.04 },
  ]);
}
