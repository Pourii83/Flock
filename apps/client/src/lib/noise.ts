// Native (Android/iOS): WebRTC's built-in noise suppression only; the AI (RNNoise) filter
// needs AudioWorklet and lives in noise.web.ts.
import { getItem, setItem } from './storage';

export type NoiseMode = 'off' | 'standard' | 'strong';

export const strongNoiseSupported = () => false;

const KEY = 'flock.noise';
let preferred: NoiseMode = 'standard';

export async function loadNoisePreference() {
  const saved = (await getItem(KEY)) as NoiseMode | null;
  if (saved === 'off' || saved === 'standard') preferred = saved;
}
export const getNoisePreference = () => preferred;
export async function setNoisePreference(mode: NoiseMode) {
  preferred = mode === 'strong' ? 'standard' : mode;
  await setItem(KEY, preferred);
}

export const micConstraints = (mode: NoiseMode) => ({
  echoCancellation: true,
  noiseSuppression: mode !== 'off',
  autoGainControl: mode !== 'off',
});

/** Returns the track to send (unchanged on native) and how to release it. */
export async function processMic(raw: MediaStreamTrack, _mode: NoiseMode) {
  return { track: raw, dispose: () => raw.stop() };
}
