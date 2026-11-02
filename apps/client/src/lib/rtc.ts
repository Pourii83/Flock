// Thin WebRTC helpers. Available on web + Electron; native builds fall back to signaling-only calls.

export const rtcSupported = () =>
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as any).RTCPeerConnection === 'function' &&
  !!(globalThis as any).navigator?.mediaDevices?.getUserMedia;

export const screenShareSupported = () => !!(globalThis as any).navigator?.mediaDevices?.getDisplayMedia;

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
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 1280, height: 720 } : false });
  } catch {
    // No camera (or denied): try audio only so the call still connects.
    if (video) return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw new Error('Microphone access was blocked');
  }
}
