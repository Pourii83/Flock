// Picture-in-picture for calls in a browser: the other person's video keeps playing in a small
// floating window while the user is in another tab or app.
// - Desktop browsers / the Windows app: the Picture-in-Picture API, opened automatically on leaving
//   the tab where Chrome allows it, or with the button.
// - Chrome on Android (also the installed PWA) has no such API for pages; it shrinks a *fullscreen*
//   playing video into its own floating window when the user leaves the app. The button there puts
//   the other person's video fullscreen (with the call's sound), so going home keeps the call on top.
// Native apps don't have it yet (it needs a native module and a new APK).
import { useEffect } from 'react';
import { Platform } from 'react-native';

type PipVideo = HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };

/** Picture-in-picture is possible here (web, the browser supports it). */
export const pipSupported =
  Platform.OS === 'web' && typeof document !== 'undefined' && !!(document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;

/** Android browsers: picture-in-picture comes from Chrome itself, through a fullscreen video. */
export const pipFullscreenOnly =
  !pipSupported &&
  Platform.OS === 'web' &&
  typeof document !== 'undefined' &&
  !!document.fullscreenEnabled &&
  typeof navigator !== 'undefined' &&
  /Android/i.test(navigator.userAgent);

/** Picture-in-picture of either kind is possible here. */
export const pipAvailable = pipSupported || pipFullscreenOnly;

let fullscreenVideo: HTMLVideoElement | null = null;
let silenced: { el: HTMLAudioElement; muted: boolean }[] = [];

function leaveFullscreenVideo() {
  const video = fullscreenVideo;
  fullscreenVideo = null;
  for (const { el, muted } of silenced) el.muted = muted;
  silenced = [];
  if (!video) return;
  video.pause();
  video.srcObject = null;
  video.remove();
}

/** Android: the other person's video fullscreen, playing the call's sound itself (Chrome only floats audible video). */
async function enterFullscreenVideo(stream: MediaStream) {
  leaveFullscreenVideo();
  const video = document.createElement('video');
  video.playsInline = true;
  video.autoplay = true;
  video.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:2147483646;';
  video.srcObject = stream;
  document.body.appendChild(video);
  fullscreenVideo = video;
  // The call's own <audio> goes quiet meanwhile, so the sound isn't heard twice.
  silenced = Array.from(document.querySelectorAll('audio')).map((el) => ({ el, muted: el.muted }));
  for (const { el } of silenced) el.muted = true;
  video.muted = false;
  const done = () => {
    if (!document.fullscreenElement) {
      document.removeEventListener('fullscreenchange', done);
      leaveFullscreenVideo();
    }
  };
  document.addEventListener('fullscreenchange', done);
  try {
    await video.play();
    await video.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
    return true;
  } catch {
    document.removeEventListener('fullscreenchange', done);
    leaveFullscreenVideo();
    return false;
  }
}

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
  if (!stream || !stream.getVideoTracks().length) return false;
  if (pipFullscreenOnly) return enterFullscreenVideo(stream);
  if (!pipSupported) return false;
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
  if (fullscreenVideo) {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    leaveFullscreenVideo();
    return;
  }
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
    // (Android has no automatic route: the button puts the video fullscreen first.)
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
