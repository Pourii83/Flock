import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';

// The browser streams the video itself through a short-lived signed link: it asks only for the parts
// it needs (even the header at the end of the file), so a preview never downloads the whole upload.

type Frame = { src: string; width: number; height: number };
/** Frames already made, so scrolling the thread doesn't download a video twice. */
const frames = new Map<string, Frame>();

/** Grabs the first frame of a video blob as a JPEG data URL, with the video's pixel size. */
function firstFrame(src: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    // Drawing a cross-origin video needs CORS, or the canvas can't be read back.
    if (new URL(src, window.location.href).origin !== window.location.origin) video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const timeout = setTimeout(() => reject(new Error('timeout')), 25000);
    const fail = () => {
      clearTimeout(timeout);
      reject(new Error('no frame'));
    };
    video.onerror = fail;
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const scale = Math.min(1, 640 / width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        clearTimeout(timeout);
        resolve({ src: canvas.toDataURL('image/jpeg', 0.8), width, height });
      } catch {
        fail();
      }
    };
    video.src = src;
  });
}

/** A still frame of a chat video (web/Electron); reports the video's size so the bubble can match it. */
export function VideoThumb({ url, onSize }: { url: string; size?: number; mimeType?: string; onSize?: (width: number, height: number) => void }) {
  const [frame, setFrame] = useState<Frame | null>(frames.get(url) ?? null);

  useEffect(() => {
    if (frame) return;
    let cancelled = false;
    api
      .fileLink(url)
      .then(({ url: signed }) => firstFrame(`${getApiUrl()}${signed}`))
      .then((made) => {
        frames.set(url, made);
        if (!cancelled) setFrame(made);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, frame]);

  useEffect(() => {
    if (frame) onSize?.(frame.width, frame.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report once per frame
  }, [frame]);

  if (!frame) return null;
  return <img src={frame.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
}
