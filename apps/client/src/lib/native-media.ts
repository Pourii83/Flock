// Web/Electron: the browser provides WebRTC and audio routing; call tones come from Web Audio.
// The native implementation lives in native-media.native.ts.
import { startRingback, startRingtone, stopTones } from './ringer';
import { t } from './i18n';

export type AudioDeviceChoice = { id: string; label: string; kind: 'input' | 'output' };
export type AudioDeviceStatus = { devices: AudioDeviceChoice[]; selectedInputId: string; selectedOutputId: string };

/**
 * A readable device name: no USB vendor:product id ("(24ae:7003)"), no Windows endpoint number
 * ("3- "), and no "Microphone (…)" / "Speakers (…)" wrapper — the section already says which it is.
 */
export function cleanDeviceLabel(label: string) {
  let name = label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim();
  const wrapped = /^(?:microphone|microphone array|speakers?|headphones|headset|line in|line out)\s*\((.+)\)$/i.exec(name);
  if (wrapped) name = wrapped[1]!.trim();
  return name.replace(/^\d+\s*-\s+/, '').trim() || label;
}

// Chrome adds virtual entries: "Default - X" (follows the system default) and, on Windows,
// "Communications - X" (the communications default). The latter is only a second name for a
// real device, so it is left out; the former becomes "System default (X)".
const ALIAS = /^(default|communications)\s+-\s+/i;

const browserAudioDevices = async (): Promise<AudioDeviceStatus> => {
  const media = (globalThis as any).navigator?.mediaDevices;
  if (!media?.enumerateDevices) return { devices: [], selectedInputId: 'default', selectedOutputId: 'default' };
  const listed = (await media.enumerateDevices()) as MediaDeviceInfo[];
  let inputs = 0;
  let outputs = 0;
  const devices = listed
    .filter((device) => (device.kind === 'audioinput' || device.kind === 'audiooutput') && device.deviceId !== 'communications')
    .map((device): AudioDeviceChoice => {
      const kind = device.kind === 'audioinput' ? 'input' : 'output';
      const id = device.deviceId || 'default';
      if (id === 'default') {
        const real = device.label.replace(ALIAS, '');
        return { id, label: real && real !== device.label ? t('System default ({name})', { name: cleanDeviceLabel(real) }) : t('System default'), kind };
      }
      const index = kind === 'input' ? ++inputs : ++outputs;
      return { id, label: device.label ? cleanDeviceLabel(device.label) : t(kind === 'input' ? 'Microphone {n}' : 'Speaker {n}', { n: index }), kind };
    })
    // The default entry first.
    .sort((a, b) => (a.kind === b.kind ? Number(b.id === 'default') - Number(a.id === 'default') : 0));
  // Chrome lists a "Default" entry; Firefox doesn't. Calls start on the system default, so it must be
  // in the list (and ticked) either way.
  for (const kind of ['output', 'input'] as const) {
    if (devices.some((d) => d.kind === kind) && !devices.some((d) => d.kind === kind && d.id === 'default')) {
      const firstOfKind = devices.findIndex((d) => d.kind === kind);
      devices.splice(firstOfKind, 0, { id: 'default', label: t('System default'), kind });
    }
  }
  return { devices, selectedInputId: 'default', selectedOutputId: 'default' };
};

export const initNativeWebRTC = () => false;

export const callAudio = {
  async prepare() {},
  start(_video: boolean) {
    stopTones();
  },
  stop() {
    stopTones();
  },
  setSpeaker(_on: boolean) {},
  devices: browserAudioDevices,
  watchDevices(refresh: () => void) {
    const media = (globalThis as any).navigator?.mediaDevices;
    media?.addEventListener?.('devicechange', refresh);
    return () => media?.removeEventListener?.('devicechange', refresh);
  },
  async selectRoute(_id: string) {},
  startRingtone,
  stopRingtone: stopTones,
  startRingback,
  stopRingback: stopTones,
};

export const canSwitchCamera = false;
export function switchCamera(_stream: MediaStream | null) {}
