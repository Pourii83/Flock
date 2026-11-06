// Web/Electron: the browser provides WebRTC and audio routing; call tones come from Web Audio.
// The native implementation lives in native-media.native.ts.
import { startRingback, startRingtone, stopTones } from './ringer';
import { t } from './i18n';

export type AudioDeviceChoice = { id: string; label: string; kind: 'input' | 'output' };
export type AudioDeviceStatus = { devices: AudioDeviceChoice[]; selectedInputId: string; selectedOutputId: string };

const browserAudioDevices = async (): Promise<AudioDeviceStatus> => {
  const media = (globalThis as any).navigator?.mediaDevices;
  if (!media?.enumerateDevices) return { devices: [], selectedInputId: 'default', selectedOutputId: 'default' };
  const listed = (await media.enumerateDevices()) as MediaDeviceInfo[];
  let inputs = 0;
  let outputs = 0;
  const devices = listed
    .filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
    .map((device): AudioDeviceChoice => {
      const kind = device.kind === 'audioinput' ? 'input' : 'output';
      const index = kind === 'input' ? ++inputs : ++outputs;
      return { id: device.deviceId || 'default', label: device.label || t(kind === 'input' ? 'Microphone {n}' : 'Speaker {n}', { n: index }), kind };
    });
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
