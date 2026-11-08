import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { LanguagePicker } from '@/components/language-picker';
import { NoisePicker } from '@/components/noise-picker';
import { ThemePicker } from '@/components/theme-picker';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Card, Icon, SectionLabel, T, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { checkServer, isInstalledApp, useServerUrl } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { t } from '@/lib/i18n';

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={colors.amberText} />
      </View>
      <T variant="body" color={colors.textMuted} style={{ flex: 1 }}>
        {label}
      </T>
      <T variant="labelLg" numberOfLines={1} style={{ maxWidth: '55%' }}>
        {value}
      </T>
    </View>
  );
}

/** Installed apps only: point the app at a different Flock server. */
function ServerSettings() {
  const { changeServer } = useAuth();
  const field = useServerField();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!field.normalized) return setError(t('Enter a valid server address.'));
    setBusy(true);
    setError(null);
    try {
      await checkServer(field.normalized);
      await changeServer(field.normalized); // signs out; the login screen opens on the new server
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <SectionLabel>{t('Server')}</SectionLabel>
      <Card style={{ gap: 14, padding: 20 }}>
        <ServerField field={field} hint={t('Changing the server signs you out so you can sign in there.')} />
        {!!error && (
          <T variant="body" color={colors.danger}>
            {error}
          </T>
        )}
        <Button title={t('Switch server')} icon="refresh-cw" variant="ghost" onPress={save} loading={busy} disabled={!field.changed} />
      </Card>
    </>
  );
}

function SettingsBody() {
  const { user, logout } = useAuth();
  const serverUrl = useServerUrl();
  const connected = useChat((s) => s.connected);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 120, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Pressable
        onPress={() => router.navigate('/profile')}
        accessibilityRole="button"
        accessibilityLabel={t('Your profile')}
        style={({ hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
          backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
        })}>
        <Avatar user={user ? { ...user, online: connected } : null} size={56} ringBg={colors.surface} />
        <View style={{ flex: 1 }}>
          <T variant="headlineSm" numberOfLines={1}>
            {user?.displayName}
          </T>
          <T variant="bodySm" color={colors.amberText} numberOfLines={1}>
            @{user?.username}
          </T>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>

      {isInstalledApp && <ServerSettings />}

      <SectionLabel>{t('Noise cancellation')}</SectionLabel>
      <NoisePicker />

      {user?.isAdmin && (
        <>
          <SectionLabel>{t('Server admin')}</SectionLabel>
          <Button title={t('App settings')} icon="sliders" variant="ghost" onPress={() => router.push('/admin')} />
        </>
      )}

      <SectionLabel>{t('Appearance')}</SectionLabel>
      <ThemePicker />

      <SectionLabel>{t('Language')}</SectionLabel>
      <LanguagePicker />

      <SectionLabel>{t('About')}</SectionLabel>
      <Card style={{ paddingVertical: 8 }}>
        <InfoRow icon="activity" label={t('Connection')} value={connected ? t('Live') : t('Reconnecting…')} />
        <InfoRow icon="server" label={t('Server')} value={serverUrl.replace(/^https?:\/\//, '')} />
        <InfoRow icon="smartphone" label={t('Platform')} value={Platform.OS === 'web' ? t('Web / Desktop') : Platform.OS} />
        <InfoRow icon="info" label={t('Version')} value={Constants.expoConfig?.version ?? '—'} />
      </Card>

      <Button title={t('Sign out')} icon="log-out" variant="danger" onPress={logout} />
    </ScrollView>
  );
}

export default function SettingsScreen() {
  const wide = useIsWide();
  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <PageTitle title={t('Settings')} />
        </View>
        <SettingsBody />
      </SafeAreaView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ paddingHorizontal: 20, paddingTop: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <PageTitle title={t('Settings')} />
      </View>
      <SettingsBody />
    </View>
  );
}
