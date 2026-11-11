import { useEffect, useState } from 'react';

import { getAuthHeaders } from '@/lib/api';
import { getApiUrl } from '@/lib/config';

/** Above this the file isn't downloaded just to draw a preview (the web fetches the whole file). */
const MAX_PREVIEW_BYTES = 40 * 1024 * 1024;
/** Frame data URLs already made, so scrolling the thread doesn't download a video twice. */
const frames = new Map<string, string>();

/** Grabs the first frame of a video blob as a JPEG data URL. */
function firstFrame(blobUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const fail = () => reject(new Error('no frame'));
    video.onerror = fail;
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / (video.videoWidth || 720));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        fail();
      }
    };
    video.src = blobUrl;
  });
}

/** A still frame of a chat video (web/Electron). Renders nothing while loading, when too big, or if it fails. */
export function VideoThumb({ url, size }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(frames.get(url) ?? null);

  useEffect(() => {
    if (src || (size && size > MAX_PREVIEW_BYTES)) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    fetch(`${getApiUrl()}${url}`, { headers: getAuthHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error('fetch failed');
        blobUrl = URL.createObjectURL(await response.blob());
        const frame = await firstFrame(blobUrl);
        frames.set(url, frame);
        if (!cancelled) setSrc(frame);
      })
      .catch(() => {})
      .finally(() => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size, src]);

  if (!src) return null;
  return <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
}
