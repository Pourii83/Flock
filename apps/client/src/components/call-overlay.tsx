import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { timer } from '@/lib/format';
import { canSwitchCamera } from '@/lib/native-media';
import { getNoisePreference, strongNoiseSupported } from '@/lib/noise';
import { screenShareSupported } from '@/lib/rtc';
import { useAuth } from '@/state/auth';
import { STREAM_PRESETS, useCalls, type CallRemote, type StreamFps, type StreamQuality, type VoiceBitrate } from '@/state/calls';
import { useConversation } from '@/state/chat-store';
import { colors, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Button, Icon, T, type IconName, UnreadBadge } from './ui';
import type { User } from '@/lib/types';
import { CallChatPanel } from './call-chat';
import { RemoteAudio } from './remote-audio';
import { VideoView } from './video-view';
import { num, t } from '@/lib/i18n';

const REACTIONS = ['❤️', '👏', '💡', '🔥'];

export function CallOverlay() {
  const { call } = useCalls();
  if (call.phase === 'idle') return null;
  const minimized = call.phase === 'active' && call.minimized;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="box-none">
      {minimized ? (
        <MiniCall />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>{call.phase === 'active' ? <ActiveCall /> : <RingingCall />}</View>
      )}
      {/* One persistent audio output per participant (web) — it keeps playing while minimized. */}
      {call.phase === 'active' && call.remotes.map((r) => <RemoteAudio key={r.userId} stream={r.stream} version={call.mediaVersion} outputDeviceId={call.audioOutputId} />)}
    </View>
  );
}

/** Floating call window: the app stays usable underneath and the call keeps running. */
function MiniCall() {
  const { call, toggleMic, hangUp, setMinimized } = useCalls();
  const { user } = useAuth();
  const wide = useIsWide();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const elapsed = useElapsed(call.answeredAt);
  const withVideo = call.remotes.find((r) => r.video && r.stream?.getVideoTracks().length);
  const shown = withVideo ?? call.remotes[0];
  return (
    <View
      style={[
        styles.mini,
        // Above the message composer (desktop) and the tab bar / composer (phones).
        { width: wide ? 280 : 240, bottom: wide ? 104 : 150 },
        Platform.OS === 'web' ? ({ boxShadow: '0 12px 36px rgba(0,0,0,0.45)' } as object) : {},
      ]}>
      <Pressable onPress={() => setMinimized(false)} accessibilityLabel={t('Return to call')}>
        {withVideo ? (
          <View style={{ height: wide ? 158 : 135, backgroundColor: colors.rail }}>
            <VideoView key={`mini-${withVideo.userId}-${call.mediaVersion}`} stream={withVideo.stream} contain={withVideo.screen} overlay />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 6 }}>
          {!withVideo && <Avatar user={shown?.user ?? call.peer} size={36} showPresence={false} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="labelLg" numberOfLines={1}>
              {call.title || shown?.user?.displayName}
            </T>
            <T variant="bodySm" color={colors.amber} style={{ fontVariant: ['tabular-nums'] }}>
              {timer(elapsed)}
              {call.isGroup ? ` · ${t('{n} in call', { n: num(call.remotes.length + 1) })}` : ''}
            </T>
          </View>
        </View>
      </Pressable>
      {peopleOpen && call.isGroup && (
        <ScrollView style={{ maxHeight: 176 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
          {[user, ...call.remotes.map((remote) => remote.user)].filter(Boolean).map((person) => (
            <View key={person!.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar user={person} size={32} showPresence={false} />
              <T variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {person!.id === user?.id ? t('You') : person!.displayName}
              </T>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 6, justifyContent: 'flex-end' }}>
        <MiniButton icon={call.micMuted ? 'mic-off' : 'mic'} active={!call.micMuted} onPress={toggleMic} label={t('Microphone')} />
        {call.isGroup && (
          <MiniButton icon="users" active={peopleOpen} onPress={() => setPeopleOpen((open) => !open)} label={t('Show participants')} />
        )}
        <MiniButton icon="maximize-2" active={false} onPress={() => setMinimized(false)} label={t('Return to call')} />
        <Pressable
          accessibilityLabel={t('Hang up')}
          onPress={hangUp}
          style={({ pressed }) => ({
            width: 52,
            height: 40,
            borderRadius: 20,
            backgroundColor: pressed ? '#B91C1C' : colors.dangerDeep,
            alignItems: 'center',
            justifyContent: 'center',
          })}>
          <Icon name="phone-off" size={18} color="#FF8A80" />
        </Pressable>
      </View>
    </View>
  );
}

function MiniButton({ icon, active, onPress, label }: { icon: IconName; active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: active ? 'rgba(255,184,77,0.22)' : pressed ? colors.surfaceHighest : colors.surfaceHigh,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Icon name={icon} size={18} color={active ? colors.amber : colors.text} />
    </Pressable>
  );
}

function usePulse() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function RoundAction({
  icon,
  label,
  bg,
  color = colors.text,
  size = 72,
  onPress,
  glow,
}: {
  icon: IconName;
  label?: string;
  bg: string;
  color?: string;
  size?: number;
  onPress: () => void;
  glow?: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: glow,
          shadowOpacity: glow ? 0.55 : 0,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 0 },
          elevation: glow ? 10 : 0,
        })}>
        <Icon name={icon} size={size * 0.38} color={color} />
      </Pressable>
      {label && (
        <T variant="labelLg" color={colors.amberSoft} style={{ fontSize: 15 }}>
          {label}
        </T>
      )}
    </View>
  );
}

/** Incoming (Stitch "Incoming Video Call") and outgoing ringing screen. */
function RingingCall() {
  const { call, accept, decline, hangUp } = useCalls();
  const { user } = useAuth();
  const conversation = useConversation(call.conversationId ?? undefined);
  const pulse = usePulse();
  const incoming = call.phase === 'incoming';
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={['rgba(255,184,77,0.10)', 'rgba(11,14,20,0)']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '60%' }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.amber }} />
            <T variant="overline" color={colors.amber} style={{ fontSize: 14 }}>
              {call.video ? t('FLOCK HD VIDEO') : t('FLOCK VOICE')}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="body" color={colors.amberSoft}>
              {t('Secure session')}
            </T>
            <Icon name="lock" size={14} color={colors.teal} />
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={{
                position: 'absolute',
                width: 240,
                height: 240,
                borderRadius: 120,
                borderWidth: 18,
                borderColor: 'rgba(255,184,77,0.35)',
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              }}
            />
            <View style={{ position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 14, borderColor: 'rgba(255,184,77,0.22)' }} />
            {call.isGroup && conversation ? (
              <ConversationAvatar conversation={conversation} meId={user?.id} size={180} />
            ) : (
              <Avatar user={call.peer} size={180} ring={colors.teal} ringBg={colors.canvas} />
            )}
          </View>
          <T variant="display" style={{ fontSize: 40, textAlign: 'center' }}>
            {call.title || call.peer?.displayName}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="bodyLg" color={colors.amberSoft} style={{ fontSize: 18, textAlign: 'center' }}>
              {incoming
                ? call.isGroup && call.peer
                  ? t('{name} is calling the group', { name: call.peer.displayName })
                  : call.video
                    ? t('Flock Video Calling')
                    : t('Flock Voice Calling')
                : t('Ringing…')}
            </T>
            <Icon name="bar-chart-2" size={18} color={colors.amber} />
          </View>
          {!call.isGroup && !!call.peer?.title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Icon name="briefcase" size={14} color={colors.textMuted} />
              <T variant="body" color={colors.amberSoft}>
                {call.peer.title}
              </T>
            </View>
          )}
        </View>

        <View style={{ width: '100%', gap: 32, paddingBottom: 12 }}>
          {incoming && (
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { icon: 'message-square' as const, text: "Can't talk right now" },
                { icon: 'clock' as const, text: t('Call you back?') },
              ].map((q) => (
                <Pressable
                  key={q.text}
                  onPress={() => decline(q.text)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
                    borderRadius: radius.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  })}>
                  <Icon name={q.icon} size={16} color={colors.amber} />
                  <T variant="body" style={{ fontSize: 15 }}>
                    {q.text}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' }}>
            {incoming ? (
              <>
                <RoundAction icon="phone-off" label={t('Decline')} bg={colors.dangerDeep} color="#FF8A80" glow={colors.danger} onPress={() => decline()} />
                {call.video && (
                  <View style={{ paddingTop: 10 }}>
                    <RoundAction icon="video-off" label={t('Audio only')} bg={colors.surfaceHigh} size={52} onPress={() => accept(true)} />
                  </View>
                )}
                <RoundAction
                  icon={call.video ? 'video' : 'phone'}
                  label={t('Accept')}
                  bg={colors.online}
                  color="#003824"
                  glow={colors.accept}
                  onPress={() => accept()}
                />
              </>
            ) : (
              <RoundAction icon="phone-off" label={t('Cancel')} bg={colors.dangerDeep} color="#FF8A80" glow={colors.danger} onPress={hangUp} />
            )}
          </View>
          {!!call.notice && <Notice text={call.notice} />}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="info" size={14} color={colors.textMuted} />
      <T variant="bodySm" color={colors.textMuted} style={{ textAlign: 'center', flexShrink: 1 }}>
        {text}
      </T>
    </View>
  );
}

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function ParticipantBackdrop({ user }: { user: User | null | undefined }) {
  if (!user?.avatarUrl) {
    return <LinearGradient colors={[`${user?.avatarColor ?? colors.amber}38`, colors.canvas]} style={StyleSheet.absoluteFill} />;
  }
  return (
    <>
      <Image source={{ uri: `${getApiUrl()}${user.avatarUrl}` }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,11,17,0.62)' }]} />
    </>
  );
}

/** Stitch "Active Video Call": full-bleed remote, PiP self view, glass control dock. */
function ActiveCall() {
  const { call, hangUp, toggleMic, toggleCamera, toggleScreenShare, flipCamera, sendReaction, setNoiseMode, setMinimized } = useCalls();
  const { user } = useAuth();
  // Dock toggle: off ↔ the user's preferred level (strong AI filter where available).
  const toggleNoise = () => {
    const preferred = getNoisePreference();
    setNoiseMode(call.noiseMode !== 'off' ? 'off' : preferred !== 'off' ? preferred : strongNoiseSupported() ? 'strong' : 'standard');
  };
  // Tap the stage to hide the controls (less visual noise), tap again to bring them back.
  const [controlsHidden, setControlsHidden] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [focusedScreen, setFocusedScreen] = useState<string | null>(null);
  // Plain opacity (+ a CSS fade on web); Animated's JS driver doesn't apply reliably on web here.
  const chrome = {
    opacity: controlsHidden ? 0 : 1,
    ...(Platform.OS === 'web' ? ({ transitionProperty: 'opacity', transitionDuration: '220ms' } as object) : {}),
  };
  const chromePointer = controlsHidden ? 'none' : 'box-none';
  const elapsed = useElapsed(call.answeredAt);
  // Each participant announces when their video slot carries camera or screen.
  const hasVideo = (r: CallRemote) => r.video && !!r.stream?.getVideoTracks().length;
  const single = call.remotes.length <= 1 ? call.remotes[0] : undefined;
  const grid = call.remotes.length > 1;
  const remoteHasVideo = !!single && hasVideo(single);
  // Local preview: the shared screen wins over the camera.
  const localPreview = call.sharingScreen ? call.screenStream : !call.cameraOff ? call.localStream : null;
  const anyVideo = call.remotes.some(hasVideo) || !!localPreview;
  const anyScreen = call.remotes.some((r) => r.screen);
  const stageUser = single?.user ?? call.peer;
  const stageName = call.isGroup ? (single?.user?.displayName ?? call.title) : call.title || call.peer?.displayName;
  const focusedRemote = call.remotes.find((remote) => remote.userId === focusedScreen && remote.screen);
  const focusedLocal = focusedScreen === 'local' && call.sharingScreen;

  const [floatAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!call.reaction) return;
    floatAnim.setValue(0);
    Animated.timing(floatAnim, { toValue: 1, duration: 1600, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [call.reaction, floatAnim]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Remote stage — tap toggles the controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setControlsHidden((h) => !h)}
        accessibilityLabel={t('Show or hide controls')}
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : {})}>
        {focusedRemote || focusedLocal ? (
          <ScreenStage
            stream={focusedLocal ? call.screenStream : focusedRemote?.stream}
            owner={focusedLocal ? user : focusedRemote?.user}
            remotes={call.remotes}
            localUser={user}
            version={call.mediaVersion}
            onClose={() => setFocusedScreen(null)}
          />
        ) : grid ? (
          <ParticipantGrid remotes={call.remotes} version={call.mediaVersion} onFocusScreen={setFocusedScreen} />
        ) : remoteHasVideo && single ? (
          <VideoView key={`remote-${single.userId}-${call.mediaVersion}`} stream={single.stream} contain={single.screen} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <LinearGradient colors={['rgba(255,184,77,0.08)', 'rgba(11,14,20,0)']} style={StyleSheet.absoluteFill} />
            <Avatar user={stageUser} size={160} ring={colors.amber} />
            <T variant="headline">{stageName}</T>
            <T variant="body" color={colors.textMuted}>
              {single?.stream ? t('Voice call') : call.isGroup && !single ? t('Waiting for others to join…') : t('Connecting…')}
            </T>
          </View>
        )}
      </Pressable>

      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} pointerEvents="box-none">
        {/* Top status */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }} pointerEvents="box-none">
          <View style={[{ gap: 8 }, chrome]} pointerEvents={chromePointer}>
            <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber }} />
              <T variant="labelLg" style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>
                {timer(elapsed)}
              </T>
              <T variant="labelLg" color={colors.textMuted}>
                •
              </T>
              <T variant="labelLg" style={{ fontSize: 16 }} numberOfLines={1}>
                {call.title || call.peer?.displayName}
              </T>
              <Pressable
                accessibilityLabel={t('Minimize call')}
                onPress={() => setMinimized(true)}
                hitSlop={8}
                style={({ pressed }) => ({ marginStart: 4, padding: 4, borderRadius: 14, backgroundColor: pressed ? colors.surfaceHigh : 'transparent' })}>
                <Icon name="minimize-2" size={16} color={colors.text} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={[styles.tag, { backgroundColor: colors.tealTint }]}>
                <Icon name="wifi" size={13} color={colors.teal} />
                <T variant="label" color={colors.teal}>
                  {anyScreen ? t('Screen') : anyVideo ? t('HD Video') : t('Voice')}
                </T>
              </View>
              {call.isGroup && (
                <View style={[styles.tag, { backgroundColor: colors.surfaceHigh }]}>
                  <Icon name="users" size={13} color={colors.text} />
                  <T variant="label">{t('{n} in call', { n: num(call.remotes.length + 1) })}</T>
                </View>
              )}
              <View style={[styles.tag, { backgroundColor: colors.amberTint }]}>
                <Icon name="activity" size={13} color={colors.amber} />
                <T variant="label" color={colors.amber}>
                  {t('Synced')}
                </T>
              </View>
            </View>
          </View>

          {localPreview && (
            <Pressable style={styles.pip} onPress={() => call.sharingScreen && setFocusedScreen('local')}>
              <VideoView
                key={`local-${call.sharingScreen ? 'screen' : 'cam'}-${call.mediaVersion}`}
                stream={localPreview}
                mirror={!call.sharingScreen && call.frontCamera}
                contain={call.sharingScreen}
                muted
                overlay
              />
              <T variant="label" style={{ position: 'absolute', start: 10, bottom: 8 }}>
                {call.sharingScreen ? (call.sharingAudio ? t('Your screen + audio') : t('Your screen')) : t('You')}
              </T>
            </Pressable>
          )}
        </View>

        {/* Floating reaction */}
        {call.reaction && (
          <Animated.Text
            key={call.reaction.key}
            style={{
              position: 'absolute',
              alignSelf: 'center',
              bottom: 200,
              fontSize: 56,
              opacity: floatAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [{ translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) }],
            }}>
            {call.reaction.emoji}
          </Animated.Text>
        )}

        {/* Bottom controls */}
        <View style={[{ padding: 16, gap: 12, alignItems: 'center' }, chrome]} pointerEvents={chromePointer}>
          {!!call.notice && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8 }]}>
              <Notice text={call.notice} />
            </View>
          )}
          {!!call.audioIssue && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8, borderColor: colors.amber }]}>
              <Notice
                text={
                  call.audioIssue === 'send'
                    ? t("Your microphone isn't sending audio — check that it's connected and allowed.")
                    : t("Not receiving the other person's audio — their microphone may be off or blocked.")
                }
              />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {REACTIONS.map((e) => (
              <Pressable key={e} onPress={() => sendReaction(e)} style={[styles.glass, { paddingHorizontal: 16, paddingVertical: 6 }]}>
                <T style={{ fontSize: 18 }}>{e}</T>
              </Pressable>
            ))}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.glass, { maxWidth: '100%', borderRadius: radius.pill }]}
            contentContainerStyle={{ flexDirection: 'row', gap: 12, padding: 10 }}>
            <DockButton icon={call.micMuted ? 'mic-off' : 'mic'} active={!call.micMuted} onPress={toggleMic} label={t('Microphone')} />
            <DockButton
              icon="wind"
              active={call.noiseMode !== 'off'}
              onPress={toggleNoise}
              label={call.noiseMode === 'off' ? t('Noise cancellation: off') : call.noiseMode === 'strong' ? t('Noise cancellation: strong (AI)') : t('Noise cancellation: standard')}
            />
            <DockButton icon="message-square" active={chatOpen} onPress={() => setChatOpen((o) => !o)} label={t('Call chat')} badge={chatOpen ? 0 : call.chatUnread} />
            <DockButton
              icon="sliders"
              active={qualityOpen}
              onPress={() => {
                setQualityOpen((open) => !open);
                setInviteOpen(false);
                setAudioOpen(false);
              }}
              label={t('Call quality')}
            />
            {call.isGroup && !call.guest && (
              <DockButton
                icon="user-plus"
                active={inviteOpen}
                onPress={() => {
                  setInviteOpen((open) => !open);
                  setQualityOpen(false);
                  setAudioOpen(false);
                }}
                label={t('Invite to call')}
              />
            )}
            <DockButton icon={call.cameraOff ? 'video-off' : 'video'} active={!call.cameraOff} onPress={toggleCamera} label={t('Camera')} />
            {canSwitchCamera && !call.cameraOff && (
              <DockButton icon="refresh-ccw" active={false} onPress={flipCamera} label={t('Switch camera')} />
            )}
            <DockButton
              icon="headphones"
              active={audioOpen}
              onPress={() => {
                setAudioOpen((open) => !open);
                setQualityOpen(false);
                setInviteOpen(false);
              }}
              label={t('Audio devices')}
            />
            {screenShareSupported() && (
              <DockButton icon="monitor" active={call.sharingScreen} onPress={toggleScreenShare} label={t('Share screen')} />
            )}
            <Pressable
              accessibilityLabel={t('Hang up')}
              onPress={hangUp}
              style={({ pressed }) => ({
                width: 64,
                height: 56,
                borderRadius: 28,
                backgroundColor: pressed ? '#B91C1C' : colors.dangerDeep,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.danger,
                shadowOpacity: 0.5,
                shadowRadius: 16,
              })}>
              <Icon name="phone-off" size={22} color="#FF8A80" />
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
      {chatOpen && <CallChatPanel onClose={() => setChatOpen(false)} />}
      {qualityOpen && <CallQualityPanel onClose={() => setQualityOpen(false)} />}
      {inviteOpen && <CallInvitePanel onClose={() => setInviteOpen(false)} />}
      {audioOpen && <AudioDevicePanel onClose={() => setAudioOpen(false)} />}
    </View>
  );
}

/** Group calls: one tile per participant (video, or their avatar while voice-only). */
function ParticipantGrid({ remotes, version, onFocusScreen }: { remotes: CallRemote[]; version: number; onFocusScreen: (userId: string) => void }) {
  const cols = remotes.length <= 4 ? 2 : 3;
  const rows = Math.ceil(remotes.length / cols);
  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 6, paddingTop: 96, paddingBottom: 170 }}>
      {remotes.map((r) => {
        const video = r.video && !!r.stream?.getVideoTracks().length;
        return (
          <View key={r.userId} style={{ width: `${100 / cols}%`, height: `${100 / rows}%`, padding: 6 }}>
            <Pressable
              disabled={!r.screen}
              onPress={() => onFocusScreen(r.userId)}
              accessibilityLabel={r.screen ? t('Focus shared screen') : r.user?.displayName}
              style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 2, borderColor: r.user?.avatarColor ?? colors.hairline }}>
              {video ? (
                <VideoView key={`tile-${r.userId}-${version}`} stream={r.stream} contain={r.screen} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ParticipantBackdrop user={r.user} />
                  <Avatar user={r.user} size={88} showPresence={false} />
                </View>
              )}
              {r.screen && (
                <View style={[styles.tag, { position: 'absolute', top: 10, end: 10, backgroundColor: colors.amberTint }]}>
                  <Icon name="maximize-2" size={13} color={colors.amber} />
                  <T variant="label" color={colors.amber}>{t('Open screen')}</T>
                </View>
              )}
              <View style={[styles.glass, { position: 'absolute', start: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                {!r.stream && <Icon name="loader" size={12} color={colors.textMuted} />}
                <T variant="label" numberOfLines={1}>
                  {r.user?.displayName ?? '…'}
                </T>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function ScreenStage({
  stream,
  owner,
  remotes,
  localUser,
  version,
  onClose,
}: {
  stream: MediaStream | null | undefined;
  owner: User | null | undefined;
  remotes: CallRemote[];
  localUser: User | null;
  version: number;
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', paddingTop: 88, paddingBottom: 150, paddingHorizontal: 10, gap: 10 }}>
      <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#05070A', borderWidth: 1, borderColor: colors.hairline }}>
        {!!stream && <VideoView key={`focused-screen-${owner?.id}-${version}`} stream={stream} contain />}
        <Pressable
          onPress={onClose}
          accessibilityLabel={t('Close focused screen')}
          style={[styles.glass, { position: 'absolute', top: 12, end: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name="minimize-2" size={18} />
        </Pressable>
        <View style={[styles.glass, { position: 'absolute', start: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 6 }]}>
          <T variant="label">{t('{name} is sharing', { name: owner?.displayName ?? t('Someone') })}</T>
        </View>
      </View>
      <ScrollView
        style={{ width: 76 }}
        contentContainerStyle={{ alignItems: 'center', gap: 12, paddingVertical: 4 }}
        showsVerticalScrollIndicator={false}>
        {[localUser, ...remotes.map((remote) => remote.user)].filter((person) => person && person.id !== owner?.id).map((person) => (
          <View
            key={person!.id}
            style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: person!.avatarColor ?? colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar user={person} size={56} showPresence={false} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View style={[styles.sidePanel, Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(0,0,0,0.5)' } as object) : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T variant="headlineSm" style={{ flex: 1 }}>{title}</T>
        <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ padding: 8 }}><Icon name="x" /></Pressable>
      </View>
      {children}
    </View>
  );
}

function ChoiceRow<T extends string | number>({ values, value, label, display, onChange }: { values: readonly T[]; value: T; label: string; display?: (value: T) => string; onChange: (value: T) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="labelLg">{label}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {values.map((item) => (
          <Pressable
            key={String(item)}
            onPress={() => onChange(item)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: item === value ? colors.amber : colors.surfaceHighest, backgroundColor: item === value ? colors.amberTint : colors.surfaceHigh }}>
            <T variant="label" color={item === value ? colors.amber : colors.text}>{display?.(item) ?? String(item)}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CallQualityPanel({ onClose }: { onClose: () => void }) {
  const { call, setVoiceBitrate, setStreamQuality, setStreamFps } = useCalls();
  const qualities: readonly StreamQuality[] = ['2k', '1080p', '720p', '480p'];
  const rates: readonly VoiceBitrate[] = [160, 320];
  const fps: readonly StreamFps[] = [60, 30, 15];
  return (
    <PanelShell title={t('Call quality')} onClose={onClose}>
      <ChoiceRow values={rates} value={call.voiceBitrate} label={t('Voice quality')} display={(v) => `${v} Kbps`} onChange={(v) => void setVoiceBitrate(v)} />
      <ChoiceRow
        values={qualities}
        value={call.streamQuality}
        label={t('Screen share quality')}
        display={(v) => v === '2k' ? `2K · ${STREAM_PRESETS[v].width}×${STREAM_PRESETS[v].height}` : v.toUpperCase()}
        onChange={(v) => void setStreamQuality(v)}
      />
      <ChoiceRow values={fps} value={call.streamFps} label={t('Screen share FPS')} display={(v) => `${v} FPS`} onChange={(v) => void setStreamFps(v)} />
      <T variant="bodySm" color={colors.textMuted}>{t('Defaults: 160 Kbps and 1080p / 30 FPS')}</T>
    </PanelShell>
  );
}

function DeviceSection({
  title,
  icon,
  devices,
  selected,
  onSelect,
}: {
  title: string;
  icon: IconName;
  devices: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={colors.amber} />
        <T variant="labelLg">{title}</T>
      </View>
      {devices.map((device) => (
        <Pressable
          key={device.id}
          disabled={busy !== null}
          onPress={async () => {
            setBusy(device.id);
            try { await onSelect(device.id); } finally { setBusy(null); }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: selected === device.id ? colors.amber : colors.surfaceHighest, backgroundColor: selected === device.id ? colors.amberTint : colors.surfaceHigh }}>
          <Icon name={busy === device.id ? 'loader' : selected === device.id ? 'check-circle' : 'circle'} size={17} color={selected === device.id ? colors.amber : colors.textMuted} />
          <T variant="body" style={{ flex: 1 }} numberOfLines={2}>{device.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

function AudioDevicePanel({ onClose }: { onClose: () => void }) {
  const { call, refreshAudioDevices, selectAudioInput, selectAudioOutput } = useCalls();
  useEffect(() => { void refreshAudioDevices(); }, [refreshAudioDevices]);
  const inputs = call.audioDevices.filter((device) => device.kind === 'input');
  const outputs = call.audioDevices.filter((device) => device.kind === 'output');
  return (
    <PanelShell title={t('Audio devices')} onClose={onClose}>
      <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ gap: 20 }}>
        <DeviceSection title={t('Microphone input')} icon="mic" devices={inputs} selected={call.audioInputId} onSelect={selectAudioInput} />
        <DeviceSection title={t('Sound output')} icon="volume-2" devices={outputs} selected={call.audioOutputId} onSelect={selectAudioOutput} />
        {Platform.OS !== 'web' && (
          <T variant="bodySm" color={colors.textMuted}>{t('On phones, Bluetooth and wired communication routes pair their microphone and speaker together.')}</T>
        )}
        {!inputs.length && !outputs.length && <T color={colors.textMuted}>{t('No audio devices found')}</T>}
      </ScrollView>
    </PanelShell>
  );
}

function CallInvitePanel({ onClose }: { onClose: () => void }) {
  const { call, inviteGuests } = useCalls();
  const { user } = useAuth();
  const conversation = useConversation(call.conversationId ?? undefined);
  const [users, setUsers] = useState<User[]>([]);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.users().then((items) => active && setUsers(items)).catch((e) => active && setError(e instanceof Error ? e.message : t('Could not load people'))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const excluded = new Set([user?.id, ...(conversation?.members.map((member) => member.id) ?? []), ...call.remotes.map((remote) => remote.userId)]);
  const candidates = users.filter((person) => !excluded.has(person.id));
  const invite = async (person: User) => {
    setBusy(person.id);
    setError('');
    try {
      await inviteGuests([person.id]);
      setSent((current) => new Set(current).add(person.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not send invitation'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell title={t('Invite to call')} onClose={onClose}>
      <T variant="bodySm" color={colors.textMuted}>{t('They can join this call temporarily without joining the group.')}</T>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
        {loading && <T color={colors.textMuted}>{t('Loading…')}</T>}
        {!loading && !candidates.length && <T color={colors.textMuted}>{t('No one else to invite')}</T>}
        {candidates.map((person) => (
          <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <Avatar user={person} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="labelLg" numberOfLines={1}>{person.displayName}</T>
              <T variant="bodySm" color={colors.textMuted}>@{person.username}</T>
            </View>
            <Button
              title={sent.has(person.id) ? t('Invited') : t('Invite')}
              size="sm"
              variant={sent.has(person.id) ? 'ghost' : 'primary'}
              disabled={sent.has(person.id)}
              loading={busy === person.id}
              onPress={() => void invite(person)}
            />
          </View>
        ))}
      </ScrollView>
      {!!error && <T variant="bodySm" color={colors.danger}>{error}</T>}
    </PanelShell>
  );
}

function DockButton({ icon, active, onPress, label, badge = 0 }: { icon: IconName; active: boolean; onPress: () => void; label: string; badge?: number }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: active ? 'rgba(255,184,77,0.22)' : pressed ? colors.surfaceHighest : colors.surfaceHigh,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Icon name={icon} size={22} color={active ? colors.amber : colors.text} />
      {badge > 0 && <UnreadBadge count={badge} style={{ position: 'absolute', top: 2, end: 2 }} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: 'rgba(18, 23, 33, 0.75)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : {}),
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mini: {
    position: 'absolute',
    end: 16,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: 'rgba(18, 23, 33, 0.96)',
    elevation: 12,
  },
  pip: {
    width: 120,
    height: 170,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.rail,
  },
  sidePanel: {
    position: 'absolute',
    end: 16,
    top: 88,
    width: 340,
    maxWidth: '92%',
    maxHeight: '76%',
    gap: 20,
    padding: 18,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: 'rgba(18, 23, 33, 0.98)',
    elevation: 18,
  },
});
