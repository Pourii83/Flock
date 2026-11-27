import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JoinAudio, joinAudioSupported } from '@/components/join-audio';
import { FlockTile } from '@/components/logo';
import { Button, Field, Icon, T } from '@/components/ui';
import { api } from '@/lib/api';
import { LANGUAGES, setLang, t, useLang } from '@/lib/i18n';
import type { PublicRoom } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { savedStartMuted, savedStartSpeakerMuted, useCalls } from '@/state/calls';
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

/**
 * Someone arriving by a meeting link is asked for the microphone and camera as soon as the page opens
 * (user request), not in the middle of joining. Only when the browser would still ask: once allowed or
 * refused, nothing happens. The streams are closed again at once. True when something was allowed.
 */
async function askForMediaEarly(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  const state = async (name: string) => {
    try {
      return (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state;
    } catch {
      return 'prompt'; // Browsers that can't say (older Firefox, Safari): ask anyway.
    }
  };
  const [mic, cam] = await Promise.all([state('microphone'), state('camera')]);
  const audio = mic === 'prompt';
  const video = cam === 'prompt';
  if (!audio && !video) return false;
  const open = async (constraints: MediaStreamConstraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((track) => track.stop());
  };
  try {
    await open({ audio, video });
    return true;
  } catch {
    // No camera on this device, or the camera was refused: the microphone alone still matters.
    if (!audio || !video) return false;
    return open({ audio: true }).then(
      () => true,
      () => false,
    );
  }
}

function expiryLabel(expiresAt: number | null) {
  if (!expiresAt) return t('Open until the host closes it');
  return t('Link valid until {time}', { time: new Date(expiresAt).toLocaleString() });
}

/** Meeting link landing page: members join with their account, anyone else picks a name. */
export default function MeetScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  // Guests have no app settings behind them: the language switch lives on this page.
  const lang = useLang();
  const { user, token } = useAuth();
  // Signed in, but joining under another name without the account (e.g. to test a guest link).
  const [asGuest, setAsGuest] = useState(false);
  const guestMode = !user || asGuest;
  const { call, joinRoom } = useCalls();
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  // The name the guest token was made with, so editing it after a failed attempt really renames.
  const [guestName, setGuestName] = useState('');
  const [reload, setReload] = useState(0);
  // Bumped when the early permission prompt was answered: the device pickers read their names again.
  const [mediaAllowed, setMediaAllowed] = useState(0);

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

  // Asked once the link proved good, before anyone types a name.
  const roomOpen = !!room?.open;
  useEffect(() => {
    if (!roomOpen) return;
    let active = true;
    void askForMediaEarly().then((allowed) => active && allowed && setMediaAllowed((n) => n + 1));
    return () => {
      active = false;
    };
  }, [roomOpen]);

  // Guests have no app behind the meeting: drop the guest connection when the page goes away, and
  // a signed-in user who joined as a guest gets their own account connection back.
  const sessionRef = useRef({ user, token });
  useEffect(() => {
    sessionRef.current = { user, token };
  }, [user, token]);
  useEffect(() => () => {
    if (!chatStore.state.guest) return;
    chatStore.stop();
    const { user: me, token: myToken } = sessionRef.current;
    if (me && myToken) chatStore.start(myToken, me);
  }, []);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      if (guestMode) {
        // The name was edited after an attempt that failed: this link joins under a new guest name.
        // The old connection stays until the new pass arrives (startGuest replaces it), so leaving the
        // page still knows there is an account connection to give back.
        let token = guestName === name.trim() ? guestToken : null;
        if (!token) {
          if (name.trim().length < 2) throw new Error(t('Enter your name to join'));
          const res = await api.joinRoomAsGuest(String(code), name.trim());
          token = res.token;
          setGuestName(name.trim());
          setGuestToken(token);
          chatStore.startGuest(token, res.user);
        } else if (!chatStore.socket || !chatStore.state.guest) {
          chatStore.startGuest(token, chatStore.state.guest!);
        }
      }
      if (!(await connectedSoon())) throw new Error(t("Can't reach the Flock server. Check your connection."));
      const start = guestMode && joinAudioSupported ? { muted: savedStartMuted(), speakerMuted: savedStartSpeakerMuted() } : undefined;
      const problem = await joinRoom(String(code), start);
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
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
            {LANGUAGES.map((item) => {
              const active = lang === item.code;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => void setLang(item.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed, hovered }: any) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.amber : colors.surfaceHigh,
                    backgroundColor: active ? colors.amberTint : pressed || hovered ? colors.surfaceHigh : 'transparent',
                  })}>
                  <T variant="label" color={active ? colors.amberText : colors.textMuted}>
                    {item.label}
                  </T>
                </Pressable>
              );
            })}
          </View>
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
              {/* Still shown after a failed attempt: the name, the devices and the mute choice can be changed and tried again. */}
              {guestMode && !joined && (
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
              {guestMode && !joined && joinAudioSupported && <JoinAudio key={mediaAllowed} joining={busy} />}
              {!!error && (
                <T variant="body" color={colors.danger}>
                  {error}
                </T>
              )}
              <Button
                title={user && !asGuest ? t('Join as {name}', { name: user.displayName }) : t('Join meeting')}
                icon="video"
                size="lg"
                loading={busy}
                onPress={join}
              />
              {!user && (
                <Button title={t('I have an account — sign in')} variant="ghost" onPress={() => router.push('/login')} />
              )}
              {!!user && !joined && (
                <Button
                  title={asGuest ? t('Join with my account instead') : t('Join as a guest instead')}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    const next = !asGuest;
                    setAsGuest(next);
                    setError(null);
                    // Back on my account: its connection replaces the guest one (start stops that first).
                    if (!next) {
                      if (chatStore.state.guest && token) chatStore.start(token, user);
                      setGuestToken(null);
                    }
                  }}
                />
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
