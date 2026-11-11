import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/avatar';
import { FlockTile } from '@/components/logo';
import { Button, Icon, T } from '@/components/ui';
import { useIsWide } from '@/hooks/use-layout';
import { api, type InviteInfo } from '@/lib/api';
import { t, num } from '@/lib/i18n';
import { PENDING_INVITE_KEY } from '@/lib/pending-invite';
import { setItem } from '@/lib/storage';
import type { Conversation } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { chatStore } from '@/state/chat-store';
import { colors, radius } from '@/theme';

/** Invite link landing page: shows the group or channel and lets a signed-in person join it. */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, ready } = useAuth();
  const wide = useIsWide();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    api.inviteInfo(String(code)).then(
      (res) => active && setInfo(res),
      (e) => active && setLoadError(e instanceof Error ? e.message : t('This invite link is not valid anymore')),
    );
    return () => {
      active = false;
    };
  }, [code, ready, user]);

  const open = (id: string) => {
    if (wide) router.replace({ pathname: '/', params: { c: id } });
    else router.replace(`/chat/${id}`);
  };

  const join = async () => {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const conversation = await api.joinInvite(String(code));
      chatStore.upsertConversation(conversation);
      open(conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Not signed in: remember the link, sign in, and the app brings the person back here.
  const signIn = async () => {
    await setItem(PENDING_INVITE_KEY, String(code));
    router.replace('/login');
  };

  const channel = info?.type === 'channel';
  // The avatar helper wants a conversation; a preview only needs its name, photo and kind.
  const preview = info
    ? ({ id: info.id, type: info.type, name: info.name, avatarUrl: info.avatarUrl, members: [], isSaved: false } as unknown as Conversation)
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            gap: 18,
            padding: 24,
            borderRadius: radius.xl,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            alignItems: 'center',
          }}>
          <FlockTile size={48} glow />
          {ready && !user ? (
            <>
              <T variant="headlineSm" style={{ textAlign: 'center' }}>
                {t('Sign in to join')}
              </T>
              <Button title={t('Sign in')} icon="log-in" onPress={() => void signIn()} />
            </>
          ) : loadError ? (
            <>
              <Icon name="slash" size={28} color={colors.textMuted} />
              <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                {loadError}
              </T>
              <Button title={t('Open chat')} variant="ghost" onPress={() => router.replace('/')} />
            </>
          ) : !info || !preview ? (
            <ActivityIndicator color={colors.amber} />
          ) : (
            <>
              <T variant="label" color={colors.textMuted}>
                {t('You are invited to join')}
              </T>
              <ConversationAvatar conversation={preview} meId={user?.id} size={84} />
              <View style={{ alignItems: 'center', gap: 4 }}>
                <T variant="headlineSm" style={{ textAlign: 'center' }}>
                  {info.name}
                </T>
                <T variant="body" color={channel ? colors.amberText : colors.textMuted}>
                  {channel ? t('Channel') : t('Group')} · {t('{n} members', { n: num(info.memberCount) })}
                </T>
              </View>
              {!!info.description && (
                <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                  {info.description}
                </T>
              )}
              {info.member ? (
                <>
                  <T variant="bodySm" color={colors.textMuted}>
                    {t('You are already in this chat')}
                  </T>
                  <Button title={t('Open chat')} icon="message-square" onPress={() => open(info.id)} />
                </>
              ) : (
                <Button title={channel ? t('Join channel') : t('Join group')} icon="user-plus" loading={busy} onPress={() => void join()} />
              )}
              {!!error && (
                <T variant="bodySm" color={colors.danger}>
                  {error}
                </T>
              )}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
