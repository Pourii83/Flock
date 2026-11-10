import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold } from '@expo-google-fonts/vazirmatn';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CallOverlay } from '@/components/call-overlay';
import { api } from '@/lib/api';
import { setBranding, useBranding } from '@/lib/brand';
import { loadServerUrl } from '@/lib/config';
import { loadLang, useLang } from '@/lib/i18n';
import { loadNoisePreference } from '@/lib/noise';
import { CallProvider } from '@/state/calls';
import { AuthProvider, useAuth } from '@/state/auth';
import { colors, loadTheme, useAccent, useThemeMode } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function navigationTheme(mode: 'dark' | 'light') {
  const base = mode === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: { ...base.colors, background: colors.canvas, card: colors.rail, primary: colors.amber, text: colors.text, border: colors.surfaceHigh },
  };
}

function RootStack() {
  const { ready, user } = useAuth();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Vazirmatn_400Regular,
    Vazirmatn_500Medium,
    Vazirmatn_600SemiBold,
    Vazirmatn_700Bold,
  });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      {/* Meeting links open with or without an account. */}
      <Stack.Screen name="meet/[code]" />
    </Stack>
  );
}

/**
 * Language-dependent UI. Keyed by language so a switch re-renders every screen
 * (and flips layout direction) without touching the session or an ongoing call.
 */
function LocalizedApp() {
  const lang = useLang();
  const mode = useThemeMode();
  const accent = useAccent();
  const brand = useBranding();
  // Derived from `lang` (not isRTL()) so the React Compiler sees the dependency.
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = brand.appName;
  }, [brand.appName]);
  return (
    // Native layout flips via Yoga's `direction`; react-native-web needs the HTML `dir` attribute.
    // Keyed by theme, language, accent and app name too: colors and copy are read at render, so a
    // change repaints (and re-translates) every screen.
    <ThemeProvider value={navigationTheme(mode)}>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <View key={`${lang}-${mode}-${accent}-${brand.appName}`} {...({ dir } as object)} style={{ flex: 1, direction: dir, backgroundColor: colors.canvas }}>
        <RootStack />
        <CallOverlay />
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    Promise.all([loadLang(), loadNoisePreference(), loadTheme()]).finally(() => setLangReady(true));
  }, []);
  // Public brand settings (app name, repository link, server version). The saved server URL is
  // resolved first so installed apps ask the right server; web uses its own origin.
  useEffect(() => {
    (async () => {
      await loadServerUrl();
      type BrandingResponse = { appName?: string; repoUrl?: string; showRepoLinks?: boolean; version?: string | null };
      const load = (api as unknown as { branding?: () => Promise<BrandingResponse> }).branding;
      try {
        const info = await load?.();
        if (info) setBranding(info);
      } catch {
        // The login screen still works with the default brand when the server is unreachable.
      }
    })();
  }, []);
  if (!langReady) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CallProvider>
          <LocalizedApp />
        </CallProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
