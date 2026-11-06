import { Stack } from 'expo-router';

import { useIsWide } from '@/hooks/use-layout';
import { colors } from '@/theme';

export default function AppLayout() {
  const wide = useIsWide();
  // Dialog-style screens: centered card on wide screens, sliding sheet on phones.
  const sheet = wide
    ? ({ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } } as const)
    : ({ presentation: 'modal', animation: 'slide_from_bottom' } as const);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="info/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="new-chat" options={sheet} />
      <Stack.Screen name="new-group" options={sheet} />
      <Stack.Screen name="add-members" options={sheet} />
      <Stack.Screen name="admin" options={sheet} />
    </Stack>
  );
}
