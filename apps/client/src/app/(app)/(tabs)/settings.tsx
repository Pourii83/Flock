import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DesktopTopBar, MobileHeader, PageTitle } from '@/components/shell';
import { Button, Card, Field, Icon, SectionLabel, T, type IconName } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { checkServer, isInstalledApp, useServerUrl } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { useChat } from '@/state/chat-store';
import { colors, radius } from '@/theme';

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={colors.amber} />
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
    if (!field.normalized) return setError('Enter a valid server address.');
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
      <SectionLabel>Server</SectionLabel>
      <Card style={{ gap: 14, padding: 20 }}>
        <ServerField field={field} hint="Changing the server signs you out so you can sign in there." />
        {!!error && (
          <T variant="body" color={colors.danger}>
            {error}
          </T>
        )}
        <Button title="Switch server" icon="refresh-cw" variant="ghost" onPress={save} loading={busy} disabled={!field.changed} />
      </Card>
    </>
  );
}

function SettingsBody() {
  const { user, updateProfile, logout } = useAuth();
  const serverUrl = useServerUrl();
  const connected = useChat((s) => s.connected);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const dirty = displayName !== user?.displayName || title !== user?.title || bio !== user?.bio;

  const save = async () => {
    if (!displayName.trim()) return setMessage({ text: 'Name cannot be empty', ok: false });
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({ displayName: displayName.trim(), title: title.trim(), bio: bio.trim() });
      setMessage({ text: 'Profile saved', ok: true });
    } catch (e: any) {
      setMessage({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 120, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 28, borderRadius: radius.xl }}>
        <Avatar user={user ? { ...user, online: connected } : null} size={96} ringBg={colors.surface} />
        <T variant="headline" style={{ marginTop: 10, fontSize: 26 }}>
          {user?.displayName}
        </T>
        <T variant="labelLg" color={colors.amber}>
          @{user?.username}
        </T>
        {!!user?.title && (
          <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 }}>
            <T variant="labelLg">{user.title}</T>
          </View>
        )}
      </Card>

      <SectionLabel>Profile</SectionLabel>
      <Card style={{ gap: 18, padding: 20 }}>
        <Field label="Display name" icon="user" value={displayName} onChangeText={setDisplayName} maxLength={60} />
        <Field label="Role / title" icon="briefcase" placeholder="Creative Technologist" value={title} onChangeText={setTitle} maxLength={60} />
        <Field label="Bio" icon="edit-3" placeholder="A few words about you" value={bio} onChangeText={setBio} maxLength={280} />
        {message && (
          <T variant="body" color={message.ok ? colors.teal : colors.danger}>
            {message.text}
          </T>
        )}
        <Button title="Save changes" icon="check" onPress={save} loading={saving} disabled={!dirty} />
      </Card>

      {isInstalledApp && <ServerSettings />}

      <SectionLabel>About</SectionLabel>
      <Card style={{ paddingVertical: 8 }}>
        <InfoRow icon="activity" label="Connection" value={connected ? 'Live' : 'Reconnecting…'} />
        <InfoRow icon="server" label="Server" value={serverUrl.replace(/^https?:\/\//, '')} />
        <InfoRow icon="smartphone" label="Platform" value={Platform.OS === 'web' ? 'Web / Desktop' : Platform.OS} />
        <InfoRow icon="info" label="Version" value="1.0.0" />
      </Card>

      <Button title="Sign out" icon="log-out" variant="danger" onPress={logout} />
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
          <PageTitle title="Settings" />
        </View>
        <SettingsBody />
      </SafeAreaView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DesktopTopBar />
      <View style={{ paddingHorizontal: 20, paddingTop: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <PageTitle title="Settings" />
      </View>
      <SettingsBody />
    </View>
  );
}
