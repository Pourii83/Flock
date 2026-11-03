import { useEffect } from 'react';

// Set the remote track gain locally, never the other participant's microphone.
export function RemoteAudio({ stream, version, volume = 1 }: { stream: MediaStream | null; version: number; outputDeviceId?: string; volume?: number }) {
  useEffect(() => {
    stream?.getAudioTracks().forEach((track) => (track as MediaStreamTrack & { _setVolume?: (value: number) => void })._setVolume?.(volume));
  }, [stream, version, volume]);
  return null;
}
