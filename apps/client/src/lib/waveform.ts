// Voice-message waveforms: a row of loudness bars like Telegram's. The recording device measures
// them and sends them with the message (one base-32 digit per bar, 0-31), so every device can draw
// them without downloading the audio. Older voice messages are measured on the fly on the web.
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export const WAVE_BARS = 48;
const DIGITS = '0123456789abcdefghijklmnopqrstuv';

export const encodeWave = (levels: number[]) => levels.map((v) => DIGITS[Math.max(0, Math.min(31, Math.round(v * 31)))]).join('');

export function decodeWave(text: string | null | undefined): number[] | null {
  if (!text || !/^[0-9a-v]{8,128}$/.test(text)) return null;
  return [...text].map((c) => DIGITS.indexOf(c) / 31);
}

/** Loudness per bar (0..1) of an audio file, scaled so the loudest bar is full height. Web only. */
export async function measureWave(data: ArrayBuffer, bars = WAVE_BARS): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(data.slice(0));
    const samples = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / bars));
    const levels: number[] = [];
    for (let b = 0; b < bars; b++) {
      // Root mean square of the slice: steadier than the peak, closer to how loud it sounds.
      let sum = 0;
      const start = b * size;
      const end = Math.min(samples.length, start + size);
      for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
      levels.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    const top = Math.max(...levels, 1e-4);
    // A gentle curve so quiet speech still shows, and silence stays a thin line.
    return encodeWave(levels.map((v) => Math.pow(v / top, 0.7)));
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => {});
  }
}

const measured = new Map<string, Promise<string | null>>();

/**
 * The bars for a voice message: the ones sent with it, or (web, older messages) measured from the
 * file the first time it is shown. `load` fetches the file's bytes.
 */
export function useWaveform(key: string, sent: string | null | undefined, load: (() => Promise<ArrayBuffer>) | null) {
  const given = useMemo(() => decodeWave(sent), [sent]);
  const [levels, setLevels] = useState<number[] | null>(null);
  useEffect(() => {
    if (given || !load || Platform.OS !== 'web') return;
    let alive = true;
    let job = measured.get(key);
    if (!job) {
      job = load().then(measureWave, () => null);
      measured.set(key, job);
    }
    job.then((text) => alive && setLevels(decodeWave(text)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is recreated each render
  }, [key, given]);
  return given ?? levels;
}
