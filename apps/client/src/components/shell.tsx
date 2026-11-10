import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { AppInfoDialog } from './app-info-dialog';
import { Avatar } from './avatar';
import { FlockTile } from './logo';
import { Icon, IconButton, T, Tooltip } from './ui';
import { t } from '@/lib/i18n';

/** Desktop top bar: app name + connection status. */
export function DesktopTopBar({ right }: { right?: ReactNode }) {
  const connected = useChat((s) => s.connected);
  return (
    <View
      style={{
        height: 72,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 28,
        gap: 18,
        backgroundColor: colors.canvas,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceHigh,
      }}>
      <T variant="headlineSm" style={{ fontSize: 22 }}>
        {t('Flock')}
      </T>
      <View style={{ flex: 1 }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingHorizontal: 14,
          paddingVertical: 7,
        }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? colors.online : colors.amber }} />
        <T variant="label" color={colors.textMuted}>
          {connected ? t('Connected · Live sync') : t('Reconnecting…')}
        </T>
      </View>
      {right}
    </View>
  );
}

/** Phone header: brand (opens app info), optional search toggle and profile avatar. */
export function MobileHeader({ onSearch }: { onSearch?: () => void }) {
  const { user } = useAuth();
  const [about, setAbout] = useState(false);
  const aboutLabel = t('About {name}', { name: t('Flock') });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 }}>
      <Pressable
        onPress={() => setAbout(true)}
        accessibilityRole="button"
        accessibilityLabel={aboutLabel}
        style={({ hovered }: any) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: radius.lg,
          backgroundColor: hovered ? colors.surface : 'transparent',
        })}>
        <FlockTile size={34} />
        <T variant="headlineSm" style={{ fontSize: 24 }}>
          {t('Flock')}
        </T>
      </Pressable>
      {onSearch && (
        <Tooltip label={t('Search')} side="bottom" style={{ alignSelf: 'center' }}>
          <IconButton name="search" label={t('Search')} onPress={onSearch} iconSize={22} />
        </Tooltip>
      )}
      <Tooltip label={t('Your profile')} side="bottom" style={{ alignSelf: 'center' }}>
        <Pressable onPress={() => router.navigate('/profile')} accessibilityRole="button" accessibilityLabel={t('Your profile')}>
          <Avatar user={user} size={40} />
        </Pressable>
      </Tooltip>
      <AppInfoDialog visible={about} onClose={() => setAbout(false)} />
    </View>
  );
}

/** Large page title with an inline count pill and optional trailing action. */
export function PageTitle({ title, pill, pillColor, action }: { title: string; pill?: string; pillColor?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T variant="headline" style={{ fontSize: 30, lineHeight: 38 }}>
        {title}
      </T>
      {pill && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <T variant="labelLg" color={pillColor ?? colors.text}>
            {pill}
          </T>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

export function ConnectionBanner() {
  const connected = useChat((s) => s.connected);
  if (connected) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.amberTint,
        paddingVertical: 6,
      }}>
      <Icon name="wifi-off" size={14} color={colors.amberText} />
      <T variant="label" color={colors.amberText}>
        {t('Reconnecting to Flock…')}
      </T>
    </View>
  );
}
