// Thin WebRTC helpers. Web/Electron use the browser's WebRTC; Android/iOS use react-native-webrtc
// (registered as globals). Expo Go has neither, so calls there fall back to signaling-only.
import { Platform } from 'react-native';

import { initNativeWebRTC } from './native-media';
import { t } from '@/lib/i18n';

export const rtcSupported = () => {
  if (Platform.OS !== 'web') initNativeWebRTC();
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).RTCPeerConnection === 'function' &&
    !!(globalThis as any).navigator?.mediaDevices?.getUserMedia
  );
};

/** No RTCPeerConnection at all: an extension, a browser policy or an old browser. */
export const webrtcBlockedMessage = () =>
  t(
    "Calls can't start: this browser is blocking WebRTC. Turn off extensions or policy that block calls (some ad blockers and privacy tools do), or use the Flock desktop app or another browser.",
  );

// Android uses react-native-webrtc's foreground MediaProjection service; iOS needs a broadcast extension.
export const screenShareSupported = () =>
  (Platform.OS === 'web' || Platform.OS === 'android') && !!(globalThis as any).navigator?.mediaDevices?.getDisplayMedia;

/** Screen sharing isn't available here (iOS, or a browser without getDisplayMedia). */
export const screenShareUnavailableMessage = () =>
  t('Screen sharing is not available here. Use Chrome, Edge or the Flock desktop app to share your screen.');

export type MediaKind = 'microphone' | 'camera' | 'screen' | 'media';

/**
 * Turns a getUserMedia / getDisplayMedia failure into an actionable sentence for the call screen:
 * what went wrong, and what the user can do about it. Never throws.
 */
export function mediaErrorMessage(error: unknown, kind: MediaKind = 'media'): string {
  const name = (error as { name?: string } | null | undefined)?.name ?? '';
  // NotAllowedError also covers "the user clicked Stop on the browser's own screen-share picker";
  // callers that care about cancelling keep it silent themselves.
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    if (kind === 'camera') return t('Camera access is blocked. Allow the camera in your browser site settings (the lock icon next to the address) or the app permissions, then try again.');
    if (kind === 'screen') return t('Screen sharing is blocked. Allow it when the browser asks, or share from the Flock desktop app.');
    if (kind === 'microphone') return t('Microphone access is blocked. Allow the microphone in your browser site settings (the lock icon next to the address) or the app permissions, then try again.');
    return t('Microphone and camera access is blocked. Allow them in your browser site settings (the lock icon next to the address) or the app permissions, then try again.');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    if (kind === 'camera') return t('No camera was found. Connect a camera, then turn it on again.');
    if (kind === 'screen') return t('There is no screen to share on this device.');
    if (kind === 'microphone') return t('No microphone was found. Connect a microphone, then pick it in the call settings.');
    return t('No microphone or camera was found. Connect one, then try again.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    if (kind === 'camera') return t('The camera is busy in another app. Close other apps that use the camera, then try again.');
    if (kind === 'screen') return t('The screen could not be captured. Close other screen-sharing or recording apps and try again.');
    return t('The microphone is busy in another app. Close other apps that use the microphone, then try again.');
  }
  if (kind === 'camera') return t("Flock couldn't start the camera. Check that it is connected and allowed, then try again.");
  if (kind === 'screen') return t("Flock couldn't share your screen. Check the browser permissions and try again.");
  if (kind === 'microphone') return t("Flock couldn't start the microphone. Check that it is connected and allowed, then try again.");
  return t("Flock couldn't start the microphone and camera. Check that they are connected and allowed, then try again.");
}

const FALLBACK_ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/** STUN/TURN servers from the Flock server (TURN credentials are short-lived), and whether media must go through the relay. */
export async function loadIceConfig(fetchIce: () => Promise<{ iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy }>) {
  try {
    const { iceServers, iceTransportPolicy } = await fetchIce();
    if (!iceServers?.length) return FALLBACK_ICE;
    return { iceServers, ...(iceTransportPolicy === 'relay' ? { iceTransportPolicy } : {}) } as RTCConfiguration;
  } catch {
    return FALLBACK_ICE;
  }
}

/**
 * Creates the peer connection. Remote tracks are collected into one MediaStream we own,
 * because a transceiver negotiated without a stream delivers tracks with no `streams`.
 */
export function createPeer(
  config: RTCConfiguration,
  onSignal: (data: unknown) => void,
  onRemoteStream: (s: MediaStream) => void,
) {
  const pc = new RTCPeerConnection(config);
  const remote = new MediaStream();
  pc.onicecandidate = (e) => {
    if (e.candidate) onSignal({ type: 'candidate', candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
    onRemoteStream(remote);
  };
  return pc;
}

/** The single video sender of a call: camera or screen is swapped in with replaceTrack(). */
export const videoTransceiver = (pc: RTCPeerConnection) =>
  pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video') ?? null;

const CAMERA = { width: 1280, height: 720, facingMode: 'user' };
const MIC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/**
 * Opens the mic (and the camera for video calls). When the camera can't be opened the call still
 * connects with audio only, and `cameraError` says why so the call screen can explain the fix.
 */
export async function getLocalMedia(video: boolean, mic: MediaTrackConstraints = MIC): Promise<{ stream: MediaStream; cameraError: string | null }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: mic, video: video ? CAMERA : false });
    return { stream, cameraError: null };
  } catch (error) {
    if (!video) throw error;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: mic, video: false });
      return { stream, cameraError: mediaErrorMessage(error, 'camera') };
    } catch {
      // The microphone failed too; report the (combined) permission/device problem.
      throw error;
    }
  }
}

/** Opens the camera mid-call; throws a friendly, actionable error when unavailable. */
export async function getCameraTrack(deviceId?: string) {
  const video = Platform.OS === 'web' && deviceId && deviceId !== 'default' ? { ...CAMERA, deviceId: { exact: deviceId } } : CAMERA;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    return stream.getVideoTracks()[0]!;
  } catch (error) {
    throw new Error(mediaErrorMessage(error, 'camera'));
  }
}
