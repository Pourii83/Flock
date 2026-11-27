import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { AppInfoDialog } from './app-info-dialog';
import { Avatar } from './avatar';
import { FlockMark } from './logo';
import { ServerUpdateButton } from './server-update';
import { Icon, T, Tooltip } from './ui';
import { t } from '@/lib/i18n';

/** A short status pill next to a page title ("Synced", "Offline"). */
function TitlePill({ label, color }: { label: string; color?: string }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T variant="label" color={color ?? colors.textMuted} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/**
 * Desktop top bar: the app name, then the page's own title, then the connection status. The page title
 * lives here so the list column below can start straight with its tools.
 */
export function DesktopTopBar({ title, pill, pillColor, right }: { title?: string; pill?: string; pillColor?: string; right?: ReactNode }) {
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
      {title ? (
        <>
          <View style={{ width: 1, height: 24, backgroundColor: colors.surfaceHigh }} />
          {/* No negative tracking: Persian glyphs overhang their box and were clipped at the edge. */}
          <T variant="headlineSm" style={{ fontSize: 22, letterSpacing: 0 }} numberOfLines={1}>
            {title}
          </T>
          {pill && <TitlePill label={pill} color={pillColor} />}
        </>
      ) : null}
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

/**
 * Phone header: the Flock mark (opens app info) with the page's title beside it, the page's own buttons,
 * and the profile avatar. One row, so the page content starts right under it.
 */
export function MobileHeader({ title, pill, pillColor, actions }: { title?: string; pill?: string; pillColor?: string; actions?: ReactNode }) {
  const { user } = useAuth();
  const [about, setAbout] = useState(false);
  const aboutLabel = t('About {name}', { name: t('Flock') });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8, minHeight: 56 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Tooltip label={aboutLabel} side="bottom" style={{ alignSelf: 'center' }}>
          <Pressable
            onPress={() => setAbout(true)}
            accessibilityRole="button"
            accessibilityLabel={aboutLabel}
            hitSlop={6}
            style={({ hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderRadius: radius.lg,
              backgroundColor: hovered ? colors.surface : 'transparent',
            })}>
            <FlockMark size={30} tint={colors.text} />
            {!title && (
              <T variant="headlineSm" style={{ fontSize: 24 }}>
                {t('Flock')}
              </T>
            )}
          </Pressable>
        </Tooltip>
        {title ? (
          <T variant="headlineSm" numberOfLines={1} style={{ fontSize: 24, letterSpacing: 0, flexShrink: 1 }}>
            {title}
          </T>
        ) : null}
        {pill && <TitlePill label={pill} color={pillColor} />}
      </View>
      {actions}
      {/* Admin-only: a new server release is available on GitHub (hidden when up to date). */}
      <ServerUpdateButton variant="header" />
      <Tooltip label={t('Your profile')} side="bottom" style={{ alignSelf: 'center' }}>
        <Pressable onPress={() => router.navigate('/profile')} accessibilityRole="button" accessibilityLabel={t('Your profile')}>
          <Avatar user={user} size={38} />
        </Pressable>
      </Tooltip>
      <AppInfoDialog visible={about} onClose={() => setAbout(false)} />
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
