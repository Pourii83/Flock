import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppInfoDialog } from '@/components/app-info-dialog';
import { Avatar } from '@/components/avatar';
import { LanguagePicker } from '@/components/language-picker';
import { NoisePicker } from '@/components/noise-picker';
import { ThemePicker } from '@/components/theme-picker';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Card, Icon, SectionLabel, T, noOutline, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { useBranding } from '@/lib/brand';
import { checkServer, isInstalledApp, useServerUrl } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, fonts, radius, DEFAULT_ACCENT, setAccent, useAccent } from '@/theme';
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

/** Tappable info row (opens a link or the app info dialog). */
function ActionRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: radius.md,
        backgroundColor: hovered ? colors.surfaceHigh : 'transparent',
      })}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={colors.amberText} />
      </View>
      <T variant="body" color={colors.textMuted} style={{ flex: 1 }}>
        {label}
      </T>
      {!!value && (
        <T variant="labelLg" numberOfLines={1} style={{ maxWidth: '55%' }}>
          {value}
        </T>
      )}
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
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

const ACCENT_PRESETS: { hex: string; label: string }[] = [
  { hex: DEFAULT_ACCENT, label: 'Amber' },
  { hex: '#4EA8FF', label: 'Sky' },
  { hex: '#4EDEA3', label: 'Mint' },
  { hex: '#B07CFF', label: 'Violet' },
  { hex: '#FF7A9C', label: 'Rose' },
  { hex: '#F97316', label: 'Ember' },
  { hex: '#A3E635', label: 'Lime' },
  { hex: '#38BDF8', label: 'Cyan' },
];

const HEX_RE = /^#[0-9A-F]{6}$/i;

/** Dark text on a light color, white on a dark one (for the check mark inside a swatch). */
function contrastOn(hex: string) {
  if (!HEX_RE.test(hex)) return '#FFFFFF';
  const n = parseInt(hex.slice(1, 7), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#1A1205' : '#FFFFFF';
}

/** Accent color: preset swatches, a custom #RRGGBB field and Apply. Persists in theme.ts. */
function AccentPicker() {
  const accent = useAccent();
  const current = accent.toUpperCase();
  const [hex, setHex] = useState(current);
  const trimmed = hex.trim().toUpperCase();
  const valid = HEX_RE.test(trimmed);
  const apply = () => {
    if (valid) void setAccent(trimmed);
  };
  const pick = (next: string) => {
    setHex(next.toUpperCase());
    void setAccent(next);
  };

  return (
    <Card style={{ gap: 16, padding: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ACCENT_PRESETS.map((preset) => {
          const selected = current === preset.hex.toUpperCase();
          return (
            <Pressable
              key={preset.hex}
              onPress={() => pick(preset.hex)}
              accessibilityRole="radio"
              accessibilityLabel={t(preset.label)}
              accessibilityState={{ selected }}
              style={({ hovered }: any) => ({
                padding: 4,
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: selected ? colors.text : hovered ? colors.surfaceHighest : 'transparent',
              })}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: preset.hex, alignItems: 'center', justifyContent: 'center' }}>
                {selected && <Icon name="check" size={16} color={contrastOn(preset.hex)} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            height: 46,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: valid ? colors.surfaceHigh : colors.danger,
            backgroundColor: colors.canvas,
            paddingHorizontal: 14,
          }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: valid ? trimmed : colors.surfaceHigh, borderWidth: 1, borderColor: colors.surfaceHigh }} />
          <TextInput
            value={hex}
            onChangeText={setHex}
            onSubmitEditing={apply}
            placeholder={DEFAULT_ACCENT}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            style={[{ flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.medium, fontSize: 16, height: '100%' }, noOutline]}
          />
        </View>
        <Button title={t('Apply')} size="sm" onPress={apply} disabled={!valid || trimmed === current} />
      </View>
      {!valid && (
        <T variant="bodySm" color={colors.danger}>
          {t('Use a hex color like #FFB84D')}
        </T>
      )}
    </Card>
  );
}

function SettingsBody() {
  const { user, logout } = useAuth();
  const serverUrl = useServerUrl();
  const connected = useChat((s) => s.connected);
  const brand = useBranding();
  const [about, setAbout] = useState(false);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
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

      <SectionLabel>{t('Theme color')}</SectionLabel>
      <AccentPicker />

      <SectionLabel>{t('Language')}</SectionLabel>
      <LanguagePicker />

      <SectionLabel>{t('About')}</SectionLabel>
      <Card style={{ paddingVertical: 8 }}>
        <InfoRow icon="activity" label={t('Connection')} value={connected ? t('Live') : t('Reconnecting…')} />
        <InfoRow icon="server" label={t('Server')} value={serverUrl.replace(/^https?:\/\//, '')} />
        <InfoRow icon="smartphone" label={t('Platform')} value={Platform.OS === 'web' ? t('Web / Desktop') : Platform.OS} />
        <InfoRow icon="info" label={t('Version')} value={Constants.expoConfig?.version ?? '—'} />
        <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 4 }} />
        {/* The repository link lives in the About dialog only (user request). */}
        <ActionRow icon="info" label={t('About {name}', { name: brand.appName })} onPress={() => setAbout(true)} />
      </Card>

      <Button title={t('Sign out')} icon="log-out" variant="danger" onPress={logout} />

      <AppInfoDialog visible={about} onClose={() => setAbout(false)} />
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
