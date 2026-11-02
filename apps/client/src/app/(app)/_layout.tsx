import { Stack } from 'expo-router';

import { useIsWide } from '@/hooks/use-layout';
import { colors } from '@/theme';

export default function AppLayout() {
  const wide = useIsWide();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="new-chat"
        options={
          wide
            ? { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }
            : { presentation: 'modal', animation: 'slide_from_bottom' }
        }
      />
    </Stack>
  );
}
