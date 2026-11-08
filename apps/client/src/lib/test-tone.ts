import { Platform } from 'react-native';

let wavUrl: string | null = null;

/** A short two-note chime as a WAV blob (so it can go through an <audio> element and setSinkId). */
function toneUrl() {
  if (wavUrl) return wavUrl;
  const rate = 22050;
  const notes = [
    { f: 523.25, from: 0, to: 0.28 },
    { f: 783.99, from: 0.3, to: 0.62 },
  ];
  const samples = Math.floor(rate * 0.65);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const time = i / rate;
    const note = notes.find((n) => time >= n.from && time < n.to);
    let value = 0;
    if (note) {
      const local = time - note.from;
      const length = note.to - note.from;
      const envelope = Math.min(1, local / 0.01) * Math.pow(1 - local / length, 1.5);
      value = Math.sin(2 * Math.PI * note.f * local) * envelope * 0.4;
    }
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  wavUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return wavUrl;
}

/** Plays a short tone through the chosen output device (web/Electron). Resolves false if it couldn't. */
export async function playTestTone(outputDeviceId: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return false;
  try {
    const el = new Audio(toneUrl()) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    // '' is the system default in every browser ('default' is a Chrome-only id).
    if (el.setSinkId) await el.setSinkId(outputDeviceId === 'default' ? '' : outputDeviceId).catch(() => {});
    await el.play();
    return true;
  } catch {
    return false;
  }
}
