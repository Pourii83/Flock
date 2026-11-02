import { useEffect, useRef } from 'react';

/** Renders a MediaStream with a DOM <video>; web/Electron only. */
export function VideoView({ stream, mirror, muted, contain }: { stream: MediaStream | null; mirror?: boolean; muted?: boolean; contain?: boolean; overlay?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
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
