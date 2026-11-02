// Thin WebRTC helpers. Web/Electron use the browser's WebRTC; Android/iOS use react-native-webrtc
// (registered as globals). Expo Go has neither, so calls there fall back to signaling-only.
import { Platform } from 'react-native';

import { initNativeWebRTC } from './native-media';

export const rtcSupported = () => {
  if (Platform.OS !== 'web') initNativeWebRTC();
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).RTCPeerConnection === 'function' &&
    !!(globalThis as any).navigator?.mediaDevices?.getUserMedia
  );
};

// Native screen capture needs a foreground MediaProjection service; web/desktop only for now.
export const screenShareSupported = () =>
  Platform.OS === 'web' && !!(globalThis as any).navigator?.mediaDevices?.getDisplayMedia;

const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** STUN/TURN servers from the Flock server (TURN credentials are short-lived). */
export async function loadIceServers(fetchIce: () => Promise<{ iceServers: RTCIceServer[] }>) {
  try {
    const { iceServers } = await fetchIce();
    return iceServers?.length ? iceServers : FALLBACK_ICE;
  } catch {
    return FALLBACK_ICE;
  }
}

/**
 * Creates the peer connection. Remote tracks are collected into one MediaStream we own,
 * because a transceiver negotiated without a stream delivers tracks with no `streams`.
 */
export function createPeer(
  iceServers: RTCIceServer[],
  onSignal: (data: unknown) => void,
  onRemoteStream: (s: MediaStream) => void,
) {
  const pc = new RTCPeerConnection({ iceServers });
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

export async function getLocalMedia(video: boolean) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? CAMERA : false });
  } catch {
    // No camera (or denied): try audio only so the call still connects.
    if (video) return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw new Error('Microphone access was blocked');
  }
}

const CAMERA = { width: 1280, height: 720, facingMode: 'user' };

/** Opens the camera mid-call; throws a friendly error when unavailable. */
export async function getCameraTrack() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: CAMERA });
    return stream.getVideoTracks()[0]!;
  } catch {
    throw new Error('Camera is unavailable or access was blocked');
  }
}
