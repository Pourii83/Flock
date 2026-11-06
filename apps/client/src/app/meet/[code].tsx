import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlockTile } from '@/components/logo';
import { Button, Field, Icon, T } from '@/components/ui';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { PublicRoom } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCalls } from '@/state/calls';
import { chatStore } from '@/state/chat-store';
import { colors, radius } from '@/theme';

/** Resolves once the store's socket is connected (or gives up after a few seconds). */
function connectedSoon(timeoutMs = 8000) {
  return new Promise<boolean>((resolve) => {
    if (chatStore.state.connected) return resolve(true);
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = chatStore.subscribe(() => {
      if (!chatStore.state.connected) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

function expiryLabel(expiresAt: number | null) {
  if (!expiresAt) return t('Open until the host closes it');
  return t('Link valid until {time}', { time: new Date(expiresAt).toLocaleString() });
}

/** Meeting link landing page: members join with their account, anyone else picks a name. */
export default function MeetScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuth();
  const { call, joinRoom } = useCalls();
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const inCall = call.phase !== 'idle';
  const left = joined && !inCall;

  // Re-checked after the call too (left, or the host closed the room): does the link still work?
  useEffect(() => {
    let active = true;
    api.publicRoom(String(code)).then(
      (r) => active && setRoom(r),
      (e) => active && setLoadError(e instanceof Error ? e.message : t('This meeting link is not valid')),
    );
    return () => {
      active = false;
    };
  }, [code, reload, left]);

  // Guests have no app behind the meeting: drop the guest connection when the page goes away.
  useEffect(() => () => {
    if (chatStore.state.guest) chatStore.stop();
  }, []);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!user) {
        let token = guestToken;
        if (!token) {
          if (name.trim().length < 2) throw new Error(t('Enter your name to join'));
          const res = await api.joinRoomAsGuest(String(code), name.trim());
          token = res.token;
          setGuestToken(token);
          chatStore.startGuest(token, res.user);
        } else if (!chatStore.socket) {
          chatStore.startGuest(token, chatStore.state.guest!);
        }
      }
      if (!(await connectedSoon())) throw new Error(t("Can't reach the Flock server. Check your connection."));
      const problem = await joinRoom(String(code));
      if (problem) throw new Error(problem);
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };


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
            alignItems: 'stretch',
          }}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <FlockTile size={56} glow />
            {!room && !loadError ? (
              <ActivityIndicator color={colors.amber} />
            ) : (
              <>
                <T variant="headline" style={{ textAlign: 'center' }}>
                  {room?.title || t('Meeting')}
                </T>
                {!!room?.host && (
                  <T variant="body" color={colors.textMuted} style={{ textAlign: 'center' }}>
                    {t('Hosted by {name}', { name: room.host.displayName })}
                  </T>
                )}
              </>
            )}
          </View>

          {loadError ? (
            <Status icon="link-2" text={loadError} />
          ) : room && !room.open ? (
            <Status icon="clock" text={t('This meeting has ended')} />
          ) : room && left ? (
            <>
              <Status icon="log-out" text={t('You left the meeting.')} />
              <Button
                title={t('Rejoin')}
                icon="video"
                size="lg"
                loading={busy}
                onPress={() => {
                  setJoined(false);
                  setReload((n) => n + 1);
                  void join();
                }}
              />
            </>
          ) : room ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Icon name="clock" size={14} color={colors.textMuted} />
                <T variant="bodySm" color={colors.textMuted}>
                  {expiryLabel(room.expiresAt)}
                </T>
              </View>
              {!user && !guestToken && (
                <Field
                  label={t('Your name')}
                  icon="user"
                  placeholder={t('How others will see you')}
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  returnKeyType="go"
                  onSubmitEditing={join}
                  autoFocus
                />
              )}
              {!!error && (
                <T variant="body" color={colors.danger}>
                  {error}
                </T>
              )}
              <Button
                title={user ? t('Join as {name}', { name: user.displayName }) : t('Join meeting')}
                icon="video"
                size="lg"
                loading={busy}
                onPress={join}
              />
              {!user && (
                <Button title={t('I have an account — sign in')} variant="ghost" onPress={() => router.push('/login')} />
              )}
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Status({ icon, text }: { icon: 'link-2' | 'clock' | 'log-out'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceHigh }}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <T variant="body" color={colors.textMuted} style={{ flexShrink: 1 }}>
        {text}
      </T>
    </View>
  );
}
