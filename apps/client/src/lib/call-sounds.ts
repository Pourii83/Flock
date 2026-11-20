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
 * One short motif per reaction emoji, so you can hear which one arrived without looking.
 * `send` is the motif as written; `receive` is the same shape, one octave-ish lower and quieter,
 * which keeps it recognisable but softer than your own tap.
 */
const REACTION_SOUNDS: Record<string, { send: Note[]; receive: Note[] }> = {
  // Heart: warm rising third.
  '❤️': {
    send: [{ frequency: 523, at: 0, length: 0.16, volume: 0.05 }, { frequency: 659, at: 0.1, length: 0.22, volume: 0.045 }],
    receive: [{ frequency: 392, at: 0, length: 0.16, volume: 0.035 }, { frequency: 494, at: 0.1, length: 0.22, volume: 0.03 }],
  },
  // Clap: two dry, percussive taps.
  '👏': {
    send: [{ frequency: 988, at: 0, length: 0.05, volume: 0.05, type: 'triangle' }, { frequency: 988, at: 0.09, length: 0.05, volume: 0.045, type: 'triangle' }],
    receive: [{ frequency: 784, at: 0, length: 0.05, volume: 0.035, type: 'triangle' }, { frequency: 784, at: 0.09, length: 0.05, volume: 0.03, type: 'triangle' }],
  },
  // Idea: a bright little ping that hangs.
  '💡': {
    send: [{ frequency: 1047, at: 0, length: 0.1, volume: 0.05 }, { frequency: 1568, at: 0.06, length: 0.24, volume: 0.04 }],
    receive: [{ frequency: 880, at: 0, length: 0.1, volume: 0.035 }, { frequency: 1319, at: 0.06, length: 0.2, volume: 0.03 }],
  },
  // Fire: a short, rough fall.
  '🔥': {
    send: [{ frequency: 740, at: 0, length: 0.1, volume: 0.045, type: 'sawtooth' }, { frequency: 494, at: 0.08, length: 0.18, volume: 0.04, type: 'sawtooth' }],
    receive: [{ frequency: 587, at: 0, length: 0.1, volume: 0.032, type: 'sawtooth' }, { frequency: 392, at: 0.08, length: 0.18, volume: 0.028, type: 'sawtooth' }],
  },
  // Sparkle: three quick high notes.
  '✨': {
    send: [{ frequency: 1319, at: 0, length: 0.07, volume: 0.04 }, { frequency: 1568, at: 0.05, length: 0.07, volume: 0.038 }, { frequency: 2093, at: 0.1, length: 0.16, volume: 0.032 }],
    receive: [{ frequency: 1047, at: 0, length: 0.07, volume: 0.03 }, { frequency: 1319, at: 0.05, length: 0.07, volume: 0.028 }, { frequency: 1760, at: 0.1, length: 0.14, volume: 0.024 }],
  },
};

const FALLBACK_REACTION = {
  send: [{ frequency: 740, at: 0, length: 0.12, volume: 0.05 }, { frequency: 988, at: 0.07, length: 0.14, volume: 0.045 }],
  receive: [{ frequency: 988, at: 0, length: 0.11, volume: 0.04 }, { frequency: 740, at: 0.08, length: 0.16, volume: 0.035 }],
};

/**
 * A reaction in the call. Each emoji has its own motif; `send` is what you hear when you tap one,
 * `receive` a softer, lower version when someone else sends the same one.
 */
export function playReactionSound(kind: 'send' | 'receive', emoji?: string) {
  if (!settings.reactionSounds) return;
  const motif = (emoji && REACTION_SOUNDS[emoji]) || FALLBACK_REACTION;
  chime(motif[kind]);
}

/** A message arrived in the call's temporary chat while the panel is closed. */
export function playCallChatSound() {
  if (!settings.chatSounds) return;
  chime([
    { frequency: 880, at: 0, length: 0.1, volume: 0.045 },
    { frequency: 1175, at: 0.09, length: 0.18, volume: 0.04 },
  ]);
}

/** Someone raised a hand in a group call: a short, quiet two-note ping (follows the reaction-sound toggle). */
export function playRaiseHandSound() {
  if (!settings.reactionSounds) return;
  chime([
    { frequency: 660, at: 0, length: 0.09, volume: 0.03, type: 'triangle' },
    { frequency: 880, at: 0.08, length: 0.12, volume: 0.025, type: 'triangle' },
  ]);
}
