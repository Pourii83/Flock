import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Card, Field, Icon, SectionLabel, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { pickAvatar } from '@/lib/avatar-upload';
import { t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { chatStore, useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

/** Profile photo with tap-to-change and remove. */
function ProfilePhoto({ online }: { online: boolean }) {
  const { user, setAvatar } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || t('Could not update photo'));
    } finally {
      setBusy(false);
    }
  };

  const change = () =>
    run(async () => {
      const base64 = await pickAvatar();
      if (base64) await setAvatar(base64);
    });

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={change} disabled={busy} accessibilityRole="button" accessibilityLabel={t('Change profile photo')}>
        <Avatar user={user ? { ...user, online } : null} size={96} ringBg={colors.surface} />
        <View
          style={{
            position: 'absolute',
            end: -2,
            bottom: -2,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.amber,
            borderWidth: 3,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {busy ? <ActivityIndicator size="small" color={colors.onAmber} /> : <Icon name="camera" size={15} color={colors.onAmber} />}
        </View>
      </Pressable>
      {!!user?.avatarUrl && !busy && (
        <Pressable onPress={() => run(() => setAvatar(null))} hitSlop={6}>
          <T variant="label" color={colors.textMuted}>
            {t('Remove photo')}
          </T>
        </Pressable>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}

/** Row that opens the user's own "Saved Messages" conversation. */
function SavedMessagesRow() {
  const wide = useIsWide();
  const open = async () => {
    const id = await chatStore.openSavedMessages().catch(() => null);
    if (!id) return;
    if (wide) router.navigate({ pathname: '/', params: { c: id } });
    else router.push(`/chat/${id}`);
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={({ hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
        backgroundColor: hovered ? colors.surfaceHigh : colors.surface,
      })}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="bookmark" size={17} color={colors.amberText} />
      </View>
      <T variant="labelLg" style={{ flex: 1 }}>
        {t('Saved Messages')}
      </T>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function ProfileBody() {
  const { user, updateProfile } = useAuth();
  const connected = useChat((s) => s.connected);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const usernameChanged = username !== user?.username;
  const usernameError = usernameChanged && !USERNAME_RE.test(username) ? t('3–24 letters, numbers, _ or .') : null;
  const dirty = displayName !== user?.displayName || usernameChanged || title !== user?.title || bio !== user?.bio;

  const save = async () => {
    if (!displayName.trim()) return setMessage({ text: t('Name cannot be empty'), ok: false });
    if (usernameError) return setMessage({ text: t('Pick a valid username'), ok: false });
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({ displayName: displayName.trim(), title: title.trim(), bio: bio.trim(), ...(usernameChanged ? { username } : {}) });
      setMessage({ text: t('Profile saved'), ok: true });
    } catch (e: any) {
      setMessage({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 28, borderRadius: radius.xl }}>
        <ProfilePhoto online={connected} />
        <T variant="headline" style={{ marginTop: 10, fontSize: 26 }}>
          {user?.displayName}
        </T>
        <T variant="labelLg" color={colors.amberText}>
          @{user?.username}
        </T>
        {!!user?.title && (
          <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 }}>
            <T variant="labelLg">{user.title}</T>
          </View>
        )}
      </Card>

      <SectionLabel>{t('Profile')}</SectionLabel>
      <Card style={{ gap: 18, padding: 20 }}>
        <Field label={t('Display name')} icon="user" value={displayName} onChangeText={setDisplayName} maxLength={60} />
        <Field
          label={t('Username')}
          icon="at-sign"
          value={username}
          onChangeText={(v) => setUsername(v.replace(/^@/, '').trim())}
          maxLength={24}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          error={usernameError}
        />
        <Field label={t('Role / title')} icon="briefcase" placeholder={t('Creative Technologist')} value={title} onChangeText={setTitle} maxLength={60} />
        <Field label={t('Bio')} icon="edit-3" placeholder={t('A few words about you')} value={bio} onChangeText={setBio} maxLength={280} />
        {message && (
          <T variant="body" color={message.ok ? colors.teal : colors.danger}>
            {message.text}
          </T>
        )}
        <Button title={t('Save changes')} icon="check" onPress={save} loading={saving} disabled={!dirty} />
      </Card>

      <SavedMessagesRow />

      {/* Change password: needs a server endpoint and an api.changePassword() (neither exists yet). */}
    </ScrollView>
  );
}

export default function ProfileScreen() {
  const wide = useIsWide();
  if (!wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <MobileHeader />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <PageTitle title={t('Profile')} />
        </View>
        <ProfileBody />
      </SafeAreaView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ paddingHorizontal: 20, paddingTop: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <PageTitle title={t('Profile')} />
      </View>
      <ProfileBody />
    </View>
  );
}
