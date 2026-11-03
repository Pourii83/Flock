// Web/Electron: the browser provides WebRTC and audio routing; call tones come from Web Audio.
// The native implementation lives in native-media.native.ts.
import { startRingback, startRingtone, stopTones } from './ringer';

export const initNativeWebRTC = () => false;

export const callAudio = {
  start(_video: boolean) {
    stopTones();
  },
  stop() {
    stopTones();
  },
  setSpeaker(_on: boolean) {},
  startRingtone,
  stopRingtone: stopTones,
  startRingback,
  stopRingback: stopTones,
};

export const canSwitchCamera = false;
export function switchCamera(_stream: MediaStream | null) {}
