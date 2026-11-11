// Full-screen mode for video calls on Android: the status bar and the navigation buttons hide, like in
// a game. Swiping in from the top or bottom edge shows them again over the app (the layout doesn't
// move) and they tuck away by themselves.
import { Platform, StatusBar } from 'react-native';

type NavigationBarModule = { setVisibilityAsync: (visibility: 'visible' | 'hidden') => Promise<void> };

// Installed apps built before expo-navigation-bar was added don't have the native module: skip quietly.
let navigationBar: NavigationBarModule | null = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    navigationBar = require('expo-navigation-bar') as NavigationBarModule;
  } catch {
    navigationBar = null;
  }
}

export function setImmersive(on: boolean) {
  if (Platform.OS !== 'android') return;
  StatusBar.setHidden(on, 'fade');
  navigationBar?.setVisibilityAsync(on ? 'hidden' : 'visible').catch(() => {});
}
