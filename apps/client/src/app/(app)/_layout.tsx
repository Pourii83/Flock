import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useIsWide } from '@/hooks/use-layout';
import { takePendingInvite } from '@/lib/pending-invite';
import { colors } from '@/theme';

export default function AppLayout() {
  const wide = useIsWide();
  // An invite link opened before signing in: continue to it now that there is an account.
  useEffect(() => {
    void takePendingInvite().then((code) => code && router.replace(`/join/${code}` as never));
  }, []);
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
