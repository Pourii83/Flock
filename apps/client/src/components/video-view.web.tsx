import { useEffect, useRef } from 'react';

/**
 * Renders a MediaStream's video with a DOM <video>; web/Electron only.
 * Always muted: call audio plays through RemoteAudio, so remounting a video never cuts the sound.
 */
export function VideoView({ stream, mirror, contain }: { stream: MediaStream | null; mirror?: boolean; muted?: boolean; contain?: boolean; overlay?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true; // React's `muted` prop isn't reliably applied to the DOM property.
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: '100%',
        objectFit: contain ? 'contain' : 'cover',
        transform: mirror ? 'scaleX(-1)' : undefined,
        backgroundColor: '#0B0E14',
        display: 'block',
      }}
    />
  );
}
