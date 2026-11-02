// Web/Electron: the browser already provides WebRTC and handles audio routing,
// so these are no-ops. The native implementation lives in native-media.native.ts.

export const initNativeWebRTC = () => false;

export const callAudio = {
  start(_video: boolean) {},
  stop() {},
  setSpeaker(_on: boolean) {},
  startRingtone() {},
  stopRingtone() {},
};

export const canSwitchCamera = false;
export function switchCamera(_stream: MediaStream | null) {}
