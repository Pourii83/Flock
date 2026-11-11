import { useEffect, useState } from 'react';

import { getAuthHeaders } from '@/lib/api';
import { getApiUrl } from '@/lib/config';

/**
 * Only the start of the file is fetched: a video's first frame (and its size) live in the header
 * and the first seconds, so a preview doesn't need the whole upload (which can be hundreds of MB).
 * Files whose header sits at the end can't be read from a partial download and get no preview.
 */
const PREVIEW_BYTES = 8 * 1024 * 1024;

type Frame = { src: string; width: number; height: number };
/** Frames already made, so scrolling the thread doesn't download a video twice. */
const frames = new Map<string, Frame>();

/** Grabs the first frame of a video blob as a JPEG data URL, with the video's pixel size. */
function firstFrame(blobUrl: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
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
    video.src = blobUrl;
  });
}

/** A still frame of a chat video (web/Electron); reports the video's size so the bubble can match it. */
export function VideoThumb({ url, mimeType, onSize }: { url: string; size?: number; mimeType?: string; onSize?: (width: number, height: number) => void }) {
  const [frame, setFrame] = useState<Frame | null>(frames.get(url) ?? null);

  useEffect(() => {
    if (frame) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    fetch(`${getApiUrl()}${url}`, { headers: { ...getAuthHeaders(), Range: `bytes=0-${PREVIEW_BYTES - 1}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('fetch failed');
        const blob = new Blob([await response.arrayBuffer()], { type: mimeType || response.headers.get('Content-Type') || 'video/mp4' });
        blobUrl = URL.createObjectURL(blob);
        const made = await firstFrame(blobUrl);
        frames.set(url, made);
        if (!cancelled) setFrame(made);
      })
      .catch(() => {})
      .finally(() => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [url, mimeType, frame]);

  useEffect(() => {
    if (frame) onSize?.(frame.width, frame.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report once per frame
  }, [frame]);

  if (!frame) return null;
  return <img src={frame.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
}
