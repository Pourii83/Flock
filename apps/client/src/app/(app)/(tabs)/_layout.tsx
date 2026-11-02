import { Tabs } from 'expo-router/tabs';

import { BottomTabBar, RailTabBar } from '@/components/tab-bars';
import { useIsWide } from '@/hooks/use-layout';
import { colors } from '@/theme';
import { t } from '@/lib/i18n';

export default function TabsLayout() {
  const wide = useIsWide();
  return (
    <Tabs
      tabBar={(props) => (wide ? <RailTabBar {...props} /> : <BottomTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: colors.canvas },
      }}>
      <Tabs.Screen name="index" options={{ title: t('Chats') }} />
      <Tabs.Screen name="calls" options={{ title: t('Calls') }} />
      <Tabs.Screen name="contacts" options={{ title: t('Contacts') }} />
      <Tabs.Screen name="settings" options={{ title: t('Settings') }} />
    </Tabs>
  );
}
