// Native builds play remote WebRTC audio through the platform audio device automatically.
export function RemoteAudio(_: { stream: MediaStream | null; version: number }) {
  return null;
}
