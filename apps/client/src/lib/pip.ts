// Picture-in-picture for calls in a browser: the other person's video keeps playing in a small
// floating window while the user is in another tab or app (Chrome on Android and desktop).
// Native apps don't have it yet (it needs a native module and a new APK).
import { useEffect } from 'react';
import { Platform } from 'react-native';

type PipVideo = HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };

/** Picture-in-picture is possible here (web, the browser supports it). */
export const pipSupported =
  Platform.OS === 'web' && typeof document !== 'undefined' && !!(document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;

/** A <video> for the stream: the one already on screen, or a hidden one made just for the PiP window. */
function videoFor(stream: MediaStream): PipVideo {
  const shown = Array.from(document.querySelectorAll('video')).find((v) => v.srcObject === stream);
  if (shown) return shown as PipVideo;
  let hidden = document.getElementById('flock-pip-video') as PipVideo | null;
  if (!hidden) {
    hidden = document.createElement('video') as PipVideo;
    hidden.id = 'flock-pip-video';
    hidden.muted = true; // the call's audio already plays elsewhere
    hidden.playsInline = true;
    hidden.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0';
    document.body.appendChild(hidden);
  }
  if (hidden.srcObject !== stream) hidden.srcObject = stream;
  void hidden.play().catch(() => {});
  return hidden;
}

/** Opens the floating window for this stream. Resolves false if the browser refused. */
export async function enterPip(stream: MediaStream | null): Promise<boolean> {
  if (!pipSupported || !stream || !stream.getVideoTracks().length) return false;
  try {
    const video = videoFor(stream);
    if (document.pictureInPictureElement === video) return true;
    if (video.readyState < 1) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
    await video.requestPictureInPicture?.();
    return true;
  } catch {
    return false;
  }
}

export function exitPip() {
  if (!pipSupported) return;
  if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
}

/**
 * While a video call is on: leaving the tab/app opens the floating window by itself where the
 * browser allows it (Chrome's automatic PiP for video calls, via the Media Session action), and
 * coming back closes it.
 */
export function useAutoPip(stream: MediaStream | null, active: boolean) {
  useEffect(() => {
    if (!pipSupported || !active) return;
    const session = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    let registered = false;
    try {
      session?.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => void enterPip(stream));
      registered = true;
    } catch {
      // Older browsers don't know this action.
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void enterPip(stream);
      else exitPip();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (registered) {
        try {
          session?.setActionHandler('enterpictureinpicture' as MediaSessionAction, null);
        } catch {}
      }
    };
  }, [stream, active]);

  // The call ended: close the window.
  useEffect(() => {
    if (!active) exitPip();
  }, [active]);
}
