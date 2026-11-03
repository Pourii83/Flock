// Web/desktop noise cancellation:
//  - standard: the browser's built-in noise suppression
//  - strong:   RNNoise (a small neural network, run locally in an AudioWorklet) on top of it
//  - off:      raw microphone (e.g. for music)
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

import { getItem, setItem } from './storage';

export type NoiseMode = 'off' | 'standard' | 'strong';

export const strongNoiseSupported = () =>
  typeof window !== 'undefined' && typeof (window as any).AudioWorkletNode === 'function' && typeof WebAssembly === 'object';

const KEY = 'flock.noise';
let preferred: NoiseMode = 'strong';

export async function loadNoisePreference() {
  const saved = (await getItem(KEY)) as NoiseMode | null;
  if (saved === 'off' || saved === 'standard' || saved === 'strong') preferred = saved;
  if (preferred === 'strong' && !strongNoiseSupported()) preferred = 'standard';
}
export const getNoisePreference = () => preferred;
export async function setNoisePreference(mode: NoiseMode) {
  preferred = mode === 'strong' && !strongNoiseSupported() ? 'standard' : mode;
  await setItem(KEY, preferred);
}

export const micConstraints = (mode: NoiseMode) => ({
  echoCancellation: true,
  noiseSuppression: mode !== 'off',
  autoGainControl: mode !== 'off',
});

// Assets are served from public/noise (see public/noise/README.md).
let wasm: Promise<ArrayBuffer> | null = null;
const loadWasm = () =>
  (wasm ??= loadRnnoise({ url: '/noise/rnnoise.wasm', simdUrl: '/noise/rnnoise_simd.wasm' }).catch((e) => {
    wasm = null;
    throw e;
  }));

/**
 * Returns the track to send for this mode and a function that releases everything.
 * Falls back to the raw (browser-processed) mic if RNNoise can't start.
 */
export async function processMic(raw: MediaStreamTrack, mode: NoiseMode) {
  const plain = { track: raw, dispose: () => raw.stop() };
  if (mode !== 'strong' || !strongNoiseSupported()) return plain;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext({ sampleRate: 48000 }); // RNNoise expects 48 kHz
    const [binary] = await Promise.all([loadWasm(), ctx.audioWorklet.addModule('/noise/rnnoise-worklet.js')]);
    const source = ctx.createMediaStreamSource(new MediaStream([raw]));
    const rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binary });
    const out = ctx.createMediaStreamDestination();
    source.connect(rnnoise).connect(out);
    await ctx.resume().catch(() => {});
    const track = out.stream.getAudioTracks()[0]!;
    const context = ctx;
    return {
      track,
      dispose: () => {
        rnnoise.destroy();
        source.disconnect();
        track.stop();
        raw.stop();
        context.close().catch(() => {});
      },
    };
  } catch (e) {
    console.warn('[flock] RNNoise unavailable, using standard noise suppression', e);
    ctx?.close().catch(() => {});
    return plain;
  }
}
