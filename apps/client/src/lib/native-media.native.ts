// Android/iOS: WebRTC comes from react-native-webrtc and call audio from InCallManager.
// Both are native modules that Expo Go doesn't ship, so they're loaded defensively:
// in Expo Go calls fall back to signaling-only instead of crashing.

let webrtcReady: boolean | null = null;

/** Installs RTCPeerConnection / navigator.mediaDevices globals. Returns false if unavailable. */
export function initNativeWebRTC() {
  if (webrtcReady !== null) return webrtcReady;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    require('react-native-webrtc').registerGlobals();
    webrtcReady = true;
  } catch {
    webrtcReady = false;
  }
  return webrtcReady;
}

type InCallManagerType = typeof import('react-native-incall-manager').default;
let incall: InCallManagerType | null | undefined;

function inCallManager() {
  if (incall === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
      incall = require('react-native-incall-manager').default as InCallManagerType;
    } catch {
      incall = null;
    }
  }
  return incall;
}

export const callAudio = {
  /** Enter call audio mode: video calls default to the loudspeaker, voice calls to the earpiece. */
  start(video: boolean) {
    const m = inCallManager();
    if (!m) return;
    m.stopRingtone();
    m.start({ media: video ? 'video' : 'audio' });
    m.setKeepScreenOn(true);
    m.setForceSpeakerphoneOn(video);
  },
  stop() {
    const m = inCallManager();
    if (!m) return;
    m.stopRingtone();
    m.setKeepScreenOn(false);
    m.setForceSpeakerphoneOn(false);
    m.stop();
  },
  setSpeaker(on: boolean) {
    inCallManager()?.setForceSpeakerphoneOn(on);
  },
  startRingtone() {
    inCallManager()?.startRingtone('_DEFAULT_', [0, 600, 900], 'playback', 35);
  },
  stopRingtone() {
    inCallManager()?.stopRingtone();
  },
};

export const canSwitchCamera = true;

/** Toggles front/back camera on the local video track (react-native-webrtc extension). */
export function switchCamera(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0] as (MediaStreamTrack & { _switchCamera?: () => void }) | undefined;
  track?._switchCamera?.();
}
