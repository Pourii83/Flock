import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { Avatar } from './avatar';
import { FlockTile } from './logo';
import { Icon, T, UnreadBadge, type IconName } from './ui';
import { t } from '@/lib/i18n';

export const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'message-square', label: 'Chats' },
  calls: { icon: 'phone', label: 'Calls' },
  contacts: { icon: 'users', label: 'Contacts' },
  settings: { icon: 'settings', label: 'Settings' },
};

const useUnreadTotal = () =>
  useChat((s) => s.conversations.reduce((n, c) => n + (c.muted ? 0 : c.unreadCount), 0));

function usePress({ state, emitter, navigateToTab }: BottomTabBarProps) {
  return (routeKey: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
  };
}

/** Desktop: 72px persistent left rail. */
export function RailTabBar(props: BottomTabBarProps) {
  const { state } = props;
  const press = usePress(props);
  const unread = useUnreadTotal();
  const { user } = useAuth();
  const settingsRoute = state.routes.find((r) => r.name === 'settings');

  return (
    <View
      style={{
        width: 80,
        backgroundColor: colors.canvas,
        borderRightWidth: 1,
        borderRightColor: colors.surfaceHigh,
        alignItems: 'center',
        paddingVertical: 16,
        justifyContent: 'space-between',
      }}>
      <View style={{ alignItems: 'center', gap: 28 }}>
        <FlockTile size={52} />
        <View style={{ gap: 14, alignItems: 'center' }}>
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const focused = index === state.index;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={t(tab.label)}
                accessibilityState={{ selected: focused }}
                onPress={() => press(route.key, focused)}
                style={({ hovered }: any) => ({
                  width: 52,
                  height: 52,
                  borderRadius: radius.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? colors.amber : hovered ? colors.surface : 'transparent',
                  ...(focused && Platform.OS === 'web' ? { boxShadow: `0 0 18px ${colors.amberGlow}` } : {}),
                })}>
                <Icon name={tab.icon} size={22} color={focused ? colors.canvas : colors.textMuted} />
                {route.name === 'index' && !focused && (
                  <UnreadBadge count={unread} style={{ position: 'absolute', top: 2, right: 0 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable
        accessibilityLabel={t('Your profile')}
        onPress={() => settingsRoute && press(settingsRoute.key, state.routes[state.index]?.name === 'settings')}>
        <Avatar user={user} size={44} ringBg={colors.canvas} />
      </Pressable>
    </View>
  );
}

/** Phone: bottom navigation from the Stitch mobile screens. */
export function BottomTabBar(props: BottomTabBarProps) {
  const { state } = props;
  const press = usePress(props);
  const insets = useSafeAreaInsets();
  const unread = useUnreadTotal();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: 'rgba(11, 14, 20, 0.96)',
        borderTopWidth: 1,
        borderTopColor: colors.surfaceHigh,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 12),
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = index === state.index;
        const tint = focused ? colors.amber : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => press(route.key, focused)}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View>
              <Icon name={tab.icon} size={24} color={tint} />
              {route.name === 'index' && <UnreadBadge count={unread} style={{ position: 'absolute', top: -8, right: -14 }} />}
            </View>
            <T variant="label" color={focused ? colors.amber : colors.textMuted}>
              {t(tab.label)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
