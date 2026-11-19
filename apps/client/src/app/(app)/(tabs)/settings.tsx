import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppInfoDialog } from '@/components/app-info-dialog';
import { Avatar } from '@/components/avatar';
import { ColorPicker, ColorWheel } from '@/components/color-picker';
import { LanguagePicker } from '@/components/language-picker';
import { NoisePicker } from '@/components/noise-picker';
import { ThemePicker } from '@/components/theme-picker';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Card, Icon, SectionLabel, T, noOutline, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { useBranding } from '@/lib/brand';
import { checkServer, isInstalledApp, useServerUrl } from '@/lib/config';
import { notificationsSupported, requestNotificationPermission, setNotifySetting, useNotifySettings } from '@/lib/notifications';
import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { markRemount, rememberSettingsScroll, settingsScrollToRestore, settingsRestored } from '@/lib/settings-scroll';
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
    <View style={{ gap: 14 }}>
      <ServerField field={field} hint={t('Changing the server signs you out so you can sign in there.')} />
      {!!error && (
        <T variant="body" color={colors.danger}>
          {error}
        </T>
      )}
      <Button title={t('Switch server')} icon="refresh-cw" variant="ghost" onPress={save} loading={busy} disabled={!field.changed} />
    </View>
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
  // Free color: dragging only edits the field; Apply commits (applying remounts the app, so not per drag).
  const [pickerOpen, setPickerOpen] = useState(false);
  const apply = () => {
    if (!valid) return;
    markRemount();
    void setAccent(trimmed);
  };
  const pick = (next: string) => {
    setHex(next.toUpperCase());
    markRemount();
    void setAccent(next);
  };

  return (
    <View style={{ gap: 16 }}>
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
            width: 156,
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
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: valid ? trimmed : colors.surfaceHigh, borderWidth: 1, borderColor: colors.surfaceHighest }} />
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
        <Pressable
          onPress={() => setPickerOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={t('Custom color')}
          accessibilityState={{ expanded: pickerOpen }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: pickerOpen ? colors.text : colors.surfaceHigh,
          }}>
          <ColorWheel />
        </Pressable>
        <Button title={t('Apply')} size="sm" onPress={apply} disabled={!valid || trimmed === current} />
      </View>
      {pickerOpen && <ColorPicker value={valid ? trimmed : current} onChange={setHex} />}
      {!valid && (
        <T variant="bodySm" color={colors.danger}>
          {t('Use a hex color like #FFB84D')}
        </T>
      )}
    </View>
  );
}

/** Message and meeting-chat notifications (web and desktop). */
function NotificationSettings() {
  const { settings, permission } = useNotifySettings();
  const row = (key: keyof typeof settings, label: string, description: string, disabled = false) => (
    <Pressable
      key={key}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: settings[key], disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => setNotifySetting(key, !settings[key])}
      style={({ hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 10,
        marginHorizontal: -10,
        paddingVertical: 12,
        borderRadius: radius.md,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: hovered ? colors.surfaceHigh : 'transparent',
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="labelLg">{label}</T>
        <T variant="bodySm" color={colors.textMuted}>
          {description}
        </T>
      </View>
      <View
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          padding: 3,
          backgroundColor: settings[key] ? colors.amber : colors.surfaceHighest,
          alignItems: settings[key] ? 'flex-end' : 'flex-start',
        }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: settings[key] ? colors.onAmber : colors.textMuted }} />
      </View>
    </Pressable>
  );
  return (
    <View>
      {permission !== 'granted' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
          <Icon name="bell-off" size={16} color={permission === 'denied' ? colors.danger : colors.amberText} />
          <T variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
            {permission === 'denied'
              ? t('Notifications are blocked for this site. Allow them in the browser’s site settings.')
              : t('Allow notifications so new messages reach you while the app is in the background.')}
          </T>
          {permission === 'default' && <Button title={t('Allow')} size="sm" onPress={() => void requestNotificationPermission()} />}
        </View>
      )}
      {row('messages', t('New messages'), t('Chats you haven’t opened. Muted chats stay quiet.'))}
      {row('meetings', t('Call and meeting chat'), t('Messages in a call’s chat while you are in another tab or app.'))}
      {row('preview', t('Show message text'), t('Off: notifications only say who wrote.'), !settings.messages && !settings.meetings)}
    </View>
  );
}

type SectionKey = 'appearance' | 'language' | 'audio' | 'notifications' | 'server' | 'admin' | 'about';

/** One settings card (Stitch): an amber icon tile, a title and a one-line description over its controls. */
function SettingsSection({
  icon,
  title,
  subtitle,
  children,
  section,
  onY,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  children: ReactNode;
  section: SectionKey;
  onY?: (section: SectionKey, y: number) => void;
}) {
  return (
    <View
      onLayout={(e) => onY?.(section, e.nativeEvent.layout.y)}
      style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={colors.amberText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headlineSm" style={{ fontSize: 18 }}>
            {title}
          </T>
          <T variant="bodySm" color={colors.textMuted}>
            {subtitle}
          </T>
        </View>
      </View>
      {children}
    </View>
  );
}

/** A labelled group inside a section (e.g. the accent color under Appearance). */
function SubLabel({ children }: { children: ReactNode }) {
  return (
    <T variant="overline" color={colors.textMuted} style={{ textTransform: 'uppercase', marginBottom: -6 }}>
      {children}
    </T>
  );
}

function SettingsBody() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const restored = useRef(false);
  const viewHeight = useRef(0);
  // Web: put the page back at its old spot before the first paint, so it never shows the top first.
  useLayoutEffect(() => {
    const y = settingsScrollToRestore();
    if (y <= 0 || Platform.OS !== 'web') return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    node.scrollTop = y;
    if (node.scrollTop >= y - 1) {
      restored.current = true;
      settingsRestored();
      return;
    }
    // The screen can mount while still hidden (the app is on its way back to Settings), where a
    // scroll doesn't stick: keep trying each frame for up to a second.
    let frame = 0;
    const started = Date.now();
    const retry = () => {
      if (restored.current) return;
      node.scrollTop = y;
      if (node.scrollTop >= y - 1 || Date.now() - started > 1000) {
        restored.current = true;
        settingsRestored();
        return;
      }
      frame = requestAnimationFrame(retry);
    };
    frame = requestAnimationFrame(retry);
    return () => cancelAnimationFrame(frame);
  }, []);
  const { user, logout } = useAuth();
  const serverUrl = useServerUrl();
  const connected = useChat((s) => s.connected);
  const brand = useBranding();
  const [about, setAbout] = useState(false);
  const wide = useIsWide();
  // Desktop: a section menu beside the page jumps to each card (Stitch Settings).
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [activeSection, setActiveSection] = useState<SectionKey>('appearance');
  const recordY = (key: SectionKey, y: number) => {
    offsets.current[key] = y;
  };
  const jump = (key: SectionKey) => {
    setActiveSection(key);
    const y = offsets.current[key];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  const sections: { key: SectionKey; icon: IconName; label: string; show: boolean }[] = [
    { key: 'appearance', icon: 'droplet', label: t('Appearance'), show: true },
    { key: 'language', icon: 'globe', label: t('Language'), show: true },
    { key: 'audio', icon: 'mic', label: t('Calls & audio'), show: true },
    { key: 'notifications', icon: 'bell', label: t('Notifications'), show: notificationsSupported },
    { key: 'server', icon: 'server', label: t('Server'), show: isInstalledApp },
    { key: 'admin', icon: 'sliders', label: t('Server admin'), show: !!user?.isAdmin },
    { key: 'about', icon: 'info', label: t('About'), show: true },
  ];

  const page = (
    <ScrollView
      ref={scrollRef}
      scrollEventThrottle={32}
      onScroll={(event) => rememberSettingsScroll(event.nativeEvent.contentOffset.y)}
      onContentSizeChange={(_w, height) => {
        // Right after a repaint-remount, return to where the page was. The page grows as its
        // sections render, so keep going until it is tall enough to reach the old spot.
        if (restored.current) return;
        const y = settingsScrollToRestore();
        if (y > 0) scrollRef.current?.scrollTo({ y, animated: false });
        // Web: trust only where the page really is (an early, shorter layout clamps the scroll).
        const node = Platform.OS === 'web' ? (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.() : null;
        const reached = node ? node.scrollTop >= y - 1 : viewHeight.current > 0 && height - viewHeight.current >= y;
        if (y <= 0 || reached) {
          restored.current = true;
          settingsRestored();
        }
      }}
      onLayout={(event) => {
        viewHeight.current = event.nativeEvent.layout.height;
      }}
      style={wide ? { flex: 1 } : undefined}
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24, maxWidth: 760, width: '100%', alignSelf: wide ? 'flex-start' : 'center' }}>
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
          borderColor: colors.border,
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

      <SettingsSection icon="droplet" title={t('Appearance')} subtitle={t('Theme and accent color for the whole app.')} section="appearance" onY={recordY}>
        <ThemePicker />
        <SubLabel>{t('Theme color')}</SubLabel>
        <AccentPicker />
      </SettingsSection>

      <SettingsSection icon="globe" title={t('Language')} subtitle={t('English or Persian; Persian lays the app out right to left.')} section="language" onY={recordY}>
        <LanguagePicker />
      </SettingsSection>

      <SettingsSection icon="mic" title={t('Calls & audio')} subtitle={t('Default noise cancellation for your microphone in calls.')} section="audio" onY={recordY}>
        <NoisePicker />
      </SettingsSection>

      {notificationsSupported && (
        <SettingsSection icon="bell" title={t('Notifications')} subtitle={t('What reaches you while Flock is in the background.')} section="notifications" onY={recordY}>
          <NotificationSettings />
        </SettingsSection>
      )}

      {isInstalledApp && (
        <SettingsSection icon="server" title={t('Server')} subtitle={t('The Flock server this app talks to.')} section="server" onY={recordY}>
          <ServerSettings />
        </SettingsSection>
      )}

      {user?.isAdmin && (
        <SettingsSection icon="sliders" title={t('Server admin')} subtitle={t('Users, sign-up and upload limits for everyone on this server.')} section="admin" onY={recordY}>
          <Button title={t('App settings')} icon="sliders" variant="ghost" onPress={() => router.push('/admin')} />
        </SettingsSection>
      )}

      <SettingsSection icon="info" title={t('About')} subtitle={t('Connection, server and version.')} section="about" onY={recordY}>
        <View>
          <InfoRow icon="activity" label={t('Connection')} value={connected ? t('Live') : t('Reconnecting…')} />
          <InfoRow icon="server" label={t('Server')} value={serverUrl.replace(/^https?:\/\//, '')} />
          <InfoRow icon="smartphone" label={t('Platform')} value={Platform.OS === 'web' ? t('Web / Desktop') : Platform.OS} />
          <InfoRow icon="info" label={t('Version')} value={Constants.expoConfig?.version ?? '—'} />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          {/* The repository link lives in the About dialog only (user request). */}
          <ActionRow icon="info" label={t('About {name}', { name: brand.appName })} onPress={() => setAbout(true)} />
        </View>
      </SettingsSection>

      <Button title={t('Sign out')} icon="log-out" variant="danger" onPress={logout} />

      <AppInfoDialog visible={about} onClose={() => setAbout(false)} />
    </ScrollView>
  );

  if (!wide) return page;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 1040 }}>
      <View style={{ width: 230, paddingStart: 20, paddingTop: 20, gap: 4 }}>
        {sections
          .filter((x) => x.show)
          .map((x) => {
            const active = x.key === activeSection;
            return (
              <Pressable
                key={x.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => jump(x.key)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderRadius: radius.lg,
                  backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : 'transparent',
                })}>
                <Icon name={x.icon} size={17} color={active ? colors.onAmber : colors.textMuted} />
                <T variant="labelLg" color={active ? colors.onAmber : colors.text} numberOfLines={1}>
                  {x.label}
                </T>
              </Pressable>
            );
          })}
      </View>
      {page}
    </View>
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
      <View style={{ paddingHorizontal: 20, paddingTop: 24, maxWidth: 1040, width: '100%', alignSelf: 'center' }}>
        <PageTitle title={t('Settings')} />
      </View>
      <SettingsBody />
    </View>
  );
}
