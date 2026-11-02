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

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turn = process.env.EXPO_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn,
      username: process.env.EXPO_PUBLIC_TURN_USERNAME,
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export function createPeer(onSignal: (data: unknown) => void, onRemoteStream: (s: MediaStream) => void) {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  pc.onicecandidate = (e) => {
    if (e.candidate) onSignal({ type: 'candidate', candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    const [stream] = e.streams;
    if (stream) onRemoteStream(stream);
  };
  return pc;
}

export async function getLocalMedia(video: boolean) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 1280, height: 720, facingMode: 'user' } : false });
  } catch {
    // No camera (or denied): try audio only so the call still connects.
    if (video) return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw new Error('Microphone access was blocked');
  }
}
