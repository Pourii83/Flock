// Call tones synthesized with Web Audio (no audio files): an incoming ringtone and
// the caller's ringback ("toot… toot"). Browsers keep audio locked until the user
// interacts with the page, so the context is unlocked on the first tap/click/key.

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let active: 'ring' | 'ringback' | null = null;

function context() {
  if (typeof window === 'undefined') return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC() as AudioContext;
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    context()?.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** One soft tone: a sine pair with a short attack/release so it never clicks. */
function tone(freqs: number[], start: number, length: number, volume: number) {
  const c = context();
  if (!c) return;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + length - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(c.destination);
  for (const f of freqs) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + length);
  }
}

function loop(kind: 'ring' | 'ringback', periodMs: number, play: (t: number) => void) {
  stopTones();
  const c = context();
  if (!c) return;
  c.resume().catch(() => {});
  active = kind;
  const fire = () => play(c.currentTime + 0.01);
  fire();
  timer = setInterval(fire, periodMs);
}

/** Incoming call: a bright three-note chime, repeated. */
export function startRingtone() {
  loop('ring', 2200, (t) => {
    tone([880, 1320], t, 0.18, 0.18);
    tone([988, 1480], t + 0.22, 0.18, 0.18);
    tone([1175, 1760], t + 0.44, 0.32, 0.16);
  });
}

/** Outgoing call while it rings on the other side: classic two-tone ringback. */
export function startRingback() {
  loop('ringback', 3000, (t) => tone([440, 480], t, 1.2, 0.07));
}

export function stopTones() {
  if (timer) clearInterval(timer);
  timer = null;
  active = null;
}

export const ringing = () => active;

// Dev-only hook so e2e tests can assert which tone is playing.
if (__DEV__ && typeof window !== 'undefined') (window as any).__flockRinging = ringing;
