import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** One AudioContext shared by every level meter (browsers cap how many can exist). Web only. */
let shared: AudioContext | null = null;
function sharedContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof AudioContext === 'undefined') return null;
  if (!shared || shared.state === 'closed') shared = new AudioContext();
  return shared;
}

const POLL_MS = 80; // ~12 Hz

/**
 * Live loudness (0..1) of a stream's audio, measured with an AnalyserNode on the shared context.
 * Returns 0 on native or when there is no audio. Nodes are disconnected when the stream changes or unmounts.
 */
export function useAudioLevel(stream: MediaStream | null | undefined, active = true, version = 0): number {
  const [level, setLevel] = useState(0);
  // Re-run when the set of audio tracks changes, not for every render of the same stream.
  const trackKey = stream?.getAudioTracks().map((track) => track.id).join(',') ?? '';
  useEffect(() => {
    const ctx = sharedContext();
    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
    if (!ctx || !active || !tracks.length) return;
    // Meters are decoration: resume quietly, the first user click in the call allows it anyway.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(new MediaStream(tracks));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser); // Not connected to the destination, so nothing is played twice.
    const data = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Speech sits around 0.02-0.3 RMS; stretch that over the whole bar.
      const next = Math.min(1, Math.max(0, rms * 4));
      setLevel((prev) => (Math.abs(prev - next) < 0.03 && (next > 0 || prev === 0) ? prev : next));
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, active, version]);
  // Nothing measured (inactive, no tracks): report silence instead of the last reading.
  return active && trackKey ? level : 0;
}
