// Android/iOS: WebRTC comes from react-native-webrtc and call audio from InCallManager.
// Both are native modules that Expo Go doesn't ship, so they're loaded defensively:
// in Expo Go calls fall back to signaling-only instead of crashing.
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import { t } from './i18n';

export type AudioDeviceChoice = { id: string; label: string; kind: 'input' | 'output' };
export type AudioDeviceStatus = { devices: AudioDeviceChoice[]; selectedInputId: string; selectedOutputId: string };
export type VideoDeviceChoice = { id: string; label: string };

/** Phones switch between the front and back camera of one device instead (see switchCamera below). */
export async function listCameras(): Promise<VideoDeviceChoice[]> {
  return [];
}

const routeLabel = (route: string) =>
  t(
    ({
      AUTOMATIC: 'System default',
      BLUETOOTH: 'Bluetooth / AirPods',
      WIRED_HEADSET: 'Wired / USB headset',
      SPEAKER_PHONE: 'Phone speaker',
      EARPIECE: 'Phone earpiece',
    } as Record<string, string>)[route] ?? route,
  );

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

const routeStatus = (result?: { availableAudioDeviceList?: string; selectedAudioDevice?: string }): AudioDeviceStatus => {
  let routes: string[] = [];
  try {
    routes = JSON.parse(result?.availableAudioDeviceList || '[]');
  } catch {}
  if (Platform.OS === 'ios') routes = ['AUTOMATIC', 'SPEAKER_PHONE'];
  if (!routes.length) routes = ['AUTOMATIC'];
  const selected = result?.selectedAudioDevice || 'AUTOMATIC';
  const outputs = routes.map((route) => ({ id: route, label: routeLabel(route), kind: 'output' as const }));
  // Communication routes pair their microphone with their output on Android. iOS chooses
  // the input automatically from its current system route (including AirPods).
  const inputRoutes = Platform.OS === 'android' ? routes : ['AUTOMATIC'];
  const inputs = inputRoutes.map((route) => ({ id: route, label: routeLabel(route), kind: 'input' as const }));
  return { devices: [...inputs, ...outputs], selectedInputId: selected, selectedOutputId: selected };
};

export const callAudio = {
  async prepare() {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
      await PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT' as any).catch(() => {});
    }
  },
  /** Enter call audio mode: video calls default to the loudspeaker, voice calls to the earpiece. */
  start(video: boolean) {
    const m = inCallManager();
    if (!m) return;
    m.stopRingtone();
    m.start({ media: video ? 'video' : 'audio' });
    m.setMicrophoneMute(false);
    m.setKeepScreenOn(true);
    // Keep automatic routing so a connected Bluetooth or wired headset wins.
    // Users can explicitly choose the loudspeaker from the in-call device panel.
    (m.setForceSpeakerphoneOn as any)(null);
  },
  stop() {
    const m = inCallManager();
    if (!m) return;
    m.stopRingtone();
    m.stopRingback();
    m.setKeepScreenOn(false);
    m.setForceSpeakerphoneOn(false);
    m.stop();
  },
  setSpeaker(on: boolean) {
    inCallManager()?.setForceSpeakerphoneOn(on);
  },
  async devices() {
    const m = inCallManager();
    if (!m) return routeStatus();
    if (Platform.OS !== 'android') return routeStatus();
    try {
      return routeStatus(await m.chooseAudioRoute('__STATUS__'));
    } catch {
      return routeStatus();
    }
  },
  watchDevices(refresh: () => void) {
    if (Platform.OS !== 'android') return () => {};
    const subscription = DeviceEventEmitter.addListener('onAudioDeviceChanged', refresh);
    return () => subscription.remove();
  },
  async selectRoute(id: string) {
    const m = inCallManager();
    if (!m) return;
    if (Platform.OS === 'android') await m.chooseAudioRoute(id);
    else (m.setForceSpeakerphoneOn as any)(id === 'SPEAKER_PHONE' ? true : null);
  },
  startRingtone() {
    inCallManager()?.startRingtone('_DEFAULT_', [0, 600, 900], 'playback', 35);
  },
  stopRingtone() {
    inCallManager()?.stopRingtone();
  },
  /** Caller hears a ringback tone until the other side answers. */
  startRingback() {
    inCallManager()?.startRingback('_DTMF_');
  },
  stopRingback() {
    inCallManager()?.stopRingback();
  },
};

export const canSwitchCamera = true;

/** Toggles front/back camera on the local video track (react-native-webrtc extension). */
export function switchCamera(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0] as (MediaStreamTrack & { _switchCamera?: () => void }) | undefined;
  track?._switchCamera?.();
}
