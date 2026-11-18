// Android app: picture-in-picture for calls through the local FlockPip module (modules/flock-pip).
// During a video call, leaving the app floats the call in Android's small window; the call screen
// then shows only the video. Web uses lib/pip.ts instead.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import FlockPip from '../../modules/flock-pip';

const native = Platform.OS === 'android' ? FlockPip : null;

let inPip = false;
const listeners = new Set<() => void>();
native?.addListener('onPipChange', ({ inPip: next }) => {
  inPip = next;
  listeners.forEach((fn) => fn());
});

/** This phone can float the call (Android 8+, and an app built with the module). */
export const nativePipSupported = (() => {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
})();

/** True while the app is shrunk into the floating window. */
export function useInNativePip() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => inPip,
    () => false,
  );
}

/** While `active`, leaving the app floats the call; `landscape` picks the window's shape. */
export function useNativeAutoPip(active: boolean, landscape: boolean) {
  useEffect(() => {
    if (!native || !nativePipSupported) return;
    try {
      native.setAutoEnter(active, landscape ? 16 : 9, landscape ? 9 : 16);
    } catch {}
    return () => {
      try {
        native.setAutoEnter(false, 9, 16);
      } catch {}
    };
  }, [active, landscape]);
}

/** Floats the call now (the button in the call). */
export function enterNativePip() {
  try {
    return !!native?.enter();
  } catch {
    return false;
  }
}
