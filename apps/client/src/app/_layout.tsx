import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_600SemiBold, Vazirmatn_700Bold } from '@expo-google-fonts/vazirmatn';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CallOverlay } from '@/components/call-overlay';
import { loadLang, useLang } from '@/lib/i18n';
import { loadNoisePreference } from '@/lib/noise';
import { CallProvider } from '@/state/calls';
import { AuthProvider, useAuth } from '@/state/auth';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.canvas,
    card: colors.rail,
    primary: colors.amber,
    text: colors.text,
    border: colors.surfaceHigh,
  },
};

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
    </Stack>
  );
}

/**
 * Language-dependent UI. Keyed by language so a switch re-renders every screen
 * (and flips layout direction) without touching the session or an ongoing call.
 */
function LocalizedApp() {
  const lang = useLang();
  // Derived from `lang` (not isRTL()) so the React Compiler sees the dependency.
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  return (
    // Native layout flips via Yoga's `direction`; react-native-web needs the HTML `dir` attribute.
    <View key={lang} {...({ dir } as object)} style={{ flex: 1, direction: dir }}>
      <RootStack />
      <CallOverlay />
    </View>
  );
}

export default function RootLayout() {
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    Promise.all([loadLang(), loadNoisePreference()]).finally(() => setLangReady(true));
  }, []);
  if (!langReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <AuthProvider>
          <CallProvider>
            <StatusBar style="light" />
            <LocalizedApp />
          </CallProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
