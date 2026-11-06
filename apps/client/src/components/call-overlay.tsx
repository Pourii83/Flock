import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { getApiUrl, meetingLink } from '@/lib/config';
import { timer } from '@/lib/format';
import { canSwitchCamera } from '@/lib/native-media';
import { getNoisePreference, strongNoiseSupported } from '@/lib/noise';
import { screenShareSupported } from '@/lib/rtc';
import { REACTION_MS, STREAM_PRESETS, useCalls, type CallReaction, type CallRemote, type StreamFps, type StreamQuality, type VoiceBitrate } from '@/state/calls';
import { useConversation } from '@/state/chat-store';
import { colors, onThemeChange, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Button, Icon, T, type IconName, UnreadBadge } from './ui';
import type { User } from '@/lib/types';
import { CallChatPanel } from './call-chat';
import { RemoteAudio } from './remote-audio';
import { Slider } from './slider';
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
      {call.phase === 'active' && call.remotes.map((r) => <RemoteAudio key={r.userId} stream={r.stream} version={call.mediaVersion} outputDeviceId={call.audioOutputId} volume={r.volume ?? 1} />)}
    </View>
  );
}

/**
 * Drag support for the floating call window. There's only ever one, so its state lives here and
 * survives minimize/restore. The window keeps its default anchor and moves with a translate,
 * clamped to the visible screen. Small movements stay taps, so the buttons inside keep working.
 */
const miniDrag = (() => {
  const pan = new Animated.ValueXY();
  let offset = { x: 0, y: 0 };
  let box: LayoutRectangle | null = null;
  let screen = { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
  const clamp = (x: number, y: number) => {
    if (!box || !screen.width) return { x, y };
    const m = 8;
    return {
      x: Math.min(Math.max(x, screen.left + m - box.x), screen.width - screen.right - m - box.width - box.x),
      y: Math.min(Math.max(y, screen.top + m - box.y), screen.height - screen.bottom - m - box.height - box.y),
    };
  };
  const settle = (x: number, y: number) => {
    offset = clamp(x, y);
    pan.setValue(offset);
  };
  const responder = PanResponder.create({
    // Capture only real drags so taps still reach the buttons underneath.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => pan.setValue(clamp(offset.x + g.dx, offset.y + g.dy)),
    onPanResponderRelease: (_, g) => settle(offset.x + g.dx, offset.y + g.dy),
    onPanResponderTerminate: (_, g) => settle(offset.x + g.dx, offset.y + g.dy),
  });
  return {
    handlers: responder.panHandlers,
    transform: pan.getTranslateTransform(),
    setScreen: (next: typeof screen) => {
      screen = next;
      settle(offset.x, offset.y);
    },
    onLayout: (e: LayoutChangeEvent) => {
      box = e.nativeEvent.layout;
      settle(offset.x, offset.y);
    },
  };
})();

function useMiniDrag() {
  const { width, height } = useWindowDimensions();
  const { top, bottom, left, right } = useSafeAreaInsets();
  // Keep it on screen after rotation / window resizes.
  useEffect(() => miniDrag.setScreen({ width, height, top, bottom, left, right }), [width, height, top, bottom, left, right]);
  return miniDrag;
}

/** Floating call window: the app stays usable underneath and the call keeps running. */
function MiniCall() {
  const { call, toggleMic, hangUp, setMinimized } = useCalls();
  const { self: user } = useCalls();
  const wide = useIsWide();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const elapsed = useElapsed(call.answeredAt);
  const withVideo = call.remotes.find((r) => r.video && r.stream?.getVideoTracks().length);
  const shown = withVideo ?? call.remotes[0];
  const drag = useMiniDrag();
  return (
    <Animated.View
      onLayout={drag.onLayout}
      style={[
        styles.mini,
        // Above the message composer (desktop) and the tab bar / composer (phones).
        { width: wide ? 280 : 240, bottom: wide ? 104 : 150, transform: drag.transform },
        Platform.OS === 'web' ? ({ boxShadow: '0 12px 36px rgba(0,0,0,0.45)', cursor: 'grab', userSelect: 'none' } as object) : {},
      ]}>
      {/* The header and the button row are drag handles; the participant list keeps its own scroll. */}
      <View {...drag.handlers}>
        <Pressable onPress={() => setMinimized(false)} accessibilityLabel={t('Return to call')}>
          {withVideo ? (
            <View style={{ height: wide ? 158 : 135, backgroundColor: colors.rail }}>
              <VideoView key={`mini-${withVideo.userId}-${call.mediaVersion}`} stream={withVideo.stream} contain={withVideo.screen} overlay />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 6 }}>
            {!withVideo && <Avatar user={shown?.user ?? call.peer} size={36} showPresence={false} ring={shown?.speaking ? colors.amber : colors.hairline} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="labelLg" numberOfLines={1}>
                {call.title || shown?.user?.displayName}
              </T>
              <T variant="bodySm" color={colors.amberText} style={{ fontVariant: ['tabular-nums'] }}>
                {timer(elapsed)}
                {call.isGroup ? ` · ${t('{n} in call', { n: num(call.remotes.length + 1) })}` : ''}
              </T>
            </View>
          </View>
        </Pressable>
      </View>
      {peopleOpen && call.isGroup && (
        <ScrollView style={{ maxHeight: 176 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
          {[user, ...call.remotes.map((remote) => remote.user)].filter(Boolean).map((person) => (
            <View key={person!.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar user={person} size={32} showPresence={false} ring={(person!.id === user?.id ? call.localSpeaking : call.remotes.find((remote) => remote.userId === person!.id)?.speaking) ? colors.amber : colors.hairline} />
              <T variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {person!.id === user?.id ? t('You') : person!.displayName}
              </T>
            </View>
          ))}
        </ScrollView>
      )}
      <View {...drag.handlers} style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 6, justifyContent: 'flex-end' }}>
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
          <Icon name="phone-off" size={18} color={colors.dangerText} />
        </Pressable>
      </View>
    </Animated.View>
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
      <Icon name={icon} size={18} color={active ? colors.amberText : colors.text} />
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
        <T variant="labelLg" color={colors.amberSoftText} style={{ fontSize: 15 }}>
          {label}
        </T>
      )}
    </View>
  );
}

/** Incoming (Stitch "Incoming Video Call") and outgoing ringing screen. */
function RingingCall() {
  const { call, accept, decline, hangUp } = useCalls();
  const { self: user } = useCalls();
  const conversation = useConversation(call.conversationId ?? undefined);
  const pulse = usePulse();
  const incoming = call.phase === 'incoming';
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={['rgba(255,184,77,0.10)', `${colors.canvas}00`]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '60%' }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.amber }} />
            <T variant="overline" color={colors.amberText} style={{ fontSize: 14 }}>
              {call.video ? t('FLOCK HD VIDEO') : t('FLOCK VOICE')}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="body" color={colors.amberSoftText}>
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
            <T variant="bodyLg" color={colors.amberSoftText} style={{ fontSize: 18, textAlign: 'center' }}>
              {incoming
                ? call.isGroup && call.peer
                  ? t('{name} is calling the group', { name: call.peer.displayName })
                  : call.video
                    ? t('Flock Video Calling')
                    : t('Flock Voice Calling')
                : t('Ringing…')}
            </T>
            <Icon name="bar-chart-2" size={18} color={colors.amberText} />
          </View>
          {!call.isGroup && !!call.peer?.title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Icon name="briefcase" size={14} color={colors.textMuted} />
              <T variant="body" color={colors.amberSoftText}>
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
                  <Icon name={q.icon} size={16} color={colors.amberText} />
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
                <RoundAction icon="phone-off" label={t('Decline')} bg={colors.dangerDeep} color={colors.dangerText} glow={colors.danger} onPress={() => decline()} />
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
              <RoundAction icon="phone-off" label={t('Cancel')} bg={colors.dangerDeep} color={colors.dangerText} glow={colors.danger} onPress={hangUp} />
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

type Panel = 'chat' | 'quality' | 'invite' | 'audio' | 'mic' | 'more' | null;

/** Stitch "Active Video Call": full-bleed remote, draggable self view, glass control dock. */
function ActiveCall() {
  const { call, hangUp, toggleMic, toggleCamera, toggleScreenShare, flipCamera, sendReaction, setMinimized } = useCalls();
  const { self: user } = useCalls();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  // Tap the stage to hide the controls (less visual noise), tap again to bring them back.
  const [controlsHidden, setControlsHidden] = useState(false);
  // One panel at a time.
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((open) => (open === p ? null : p));
  const [focusedScreen, setFocusedScreen] = useState<string | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [dockHeight, setDockHeight] = useState(180);
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

  // Meeting rooms are invited to by sharing their link; group calls by picking people.
  const canInvite = call.isGroup && !call.guest && !call.room;
  const [linkCopied, setLinkCopied] = useState(false);
  const copyMeetingLink = async () => {
    if (!call.room) return;
    await Clipboard.setStringAsync(meetingLink(call.room.code));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  const canFlip = canSwitchCamera && !call.cameraOff;
  const canShare = screenShareSupported();
  // Phones keep the essentials in the dock and the rest behind "More".
  const moreItems: MenuItem[] = [
    ...(canFlip ? [{ icon: 'refresh-ccw' as const, label: t('Switch camera'), onPress: flipCamera }] : []),
    ...(canShare ? [{ icon: 'monitor' as const, label: call.sharingScreen ? t('Stop sharing') : t('Share screen'), active: call.sharingScreen, onPress: toggleScreenShare }] : []),
    { icon: 'headphones', label: t('Audio devices'), onPress: () => setPanel('audio') },
    { icon: 'sliders', label: t('Call quality'), onPress: () => setPanel('quality') },
    ...(canInvite ? [{ icon: 'user-plus' as const, label: t('Invite to call'), onPress: () => setPanel('invite') }] : []),
    ...(call.room ? [{ icon: 'link' as const, label: t('Copy meeting link'), onPress: () => void copyMeetingLink() }] : []),
    { icon: 'minimize-2', label: t('Minimize call'), onPress: () => setMinimized(true) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }} onLayout={(e) => setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {/* Remote stage — tap closes an open panel, otherwise toggles the controls */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (panel) setPanel(null);
          else setControlsHidden((h) => !h);
        }}
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
          <View style={{ flex: 1, borderWidth: 2, borderColor: single.speaking ? colors.amber : 'transparent' }}>
            <VideoView key={`remote-${single.userId}-${call.mediaVersion}`} stream={single.stream} contain={single.screen} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: dockHeight / 2 }}>
            <LinearGradient colors={['rgba(255,184,77,0.08)', `${colors.canvas}00`]} style={StyleSheet.absoluteFill} />
            <Avatar user={stageUser} size={wide ? 160 : 132} ring={single?.speaking ? colors.amber : colors.hairline} />
            <T variant="headline">{stageName}</T>
            <T variant="body" color={colors.textMuted}>
              {single?.stream ? t('Voice call') : call.isGroup && !single ? t('Waiting for others to join…') : t('Connecting…')}
            </T>
          </View>
        )}
      </Pressable>

      {/* Reactions float from the bottom of the screen to the top */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {call.reactions.map((r) => (
          <FloatingReaction key={r.key} reaction={r} stage={stage} />
        ))}
      </View>

      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} pointerEvents="box-none">
        {/* Top status */}
        <View style={[{ padding: 16, gap: 8, alignItems: 'flex-start' }, chrome]} pointerEvents={chromePointer}>
          <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingStart: 16, paddingEnd: 6, paddingVertical: 6, maxWidth: '100%' }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber }} />
            <T variant="labelLg" style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>
              {timer(elapsed)}
            </T>
            <T variant="labelLg" color={colors.textMuted}>
              •
            </T>
            <T variant="labelLg" style={{ fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
              {call.title || call.peer?.displayName}
            </T>
            <Pressable
              accessibilityLabel={t('Minimize call')}
              onPress={() => setMinimized(true)}
              hitSlop={8}
              style={({ pressed }) => ({ padding: 7, borderRadius: 16, backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh })}>
              <Icon name="minimize-2" size={16} color={colors.text} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
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
            {call.noiseMode !== 'off' && (
              <View style={[styles.tag, { backgroundColor: colors.amberTint }]}>
                <Icon name="wind" size={13} color={colors.amberText} />
                <T variant="label" color={colors.amberText}>
                  {call.noiseMode === 'strong' ? t('Strong (AI)') : t('Noise cancellation')}
                </T>
              </View>
            )}
          </View>
        </View>

        {/* Bottom controls */}
        <View
          onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
          style={[{ padding: 12, gap: 12, alignItems: 'center' }, chrome]}
          pointerEvents={chromePointer}>
          {!!call.notice && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' }]}>
              <Notice text={call.notice} />
            </View>
          )}
          {!!call.audioIssue && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8, borderColor: colors.amber, maxWidth: '100%' }]}>
              <Notice
                text={
                  call.audioIssue === 'send'
                    ? t("Your microphone isn't sending audio — check that it's connected and allowed.")
                    : t("Not receiving the other person's audio — their microphone may be off or blocked.")
                }
              />
            </View>
          )}
          <View style={[styles.glass, { flexDirection: 'row', gap: 4, padding: 4 }]}>
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                accessibilityLabel={t('React with {emoji}', { emoji: e })}
                onPress={() => sendReaction(e)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: pressed ? colors.surfaceHighest : 'transparent',
                  transform: [{ scale: pressed ? 1.15 : 1 }],
                })}>
                <T style={{ fontSize: 20 }}>{e}</T>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 14 : 10, maxWidth: '100%' }}>
            <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 8, padding: 8, flexShrink: 1 }]}>
              <MicButton muted={call.micMuted} panelOpen={panel === 'mic'} onToggle={toggleMic} onOpenPanel={() => toggle('mic')} />
              <DockButton icon={call.cameraOff ? 'video-off' : 'video'} active={!call.cameraOff} onPress={toggleCamera} label={call.cameraOff ? t('Turn camera on') : t('Turn camera off')} />
              {wide && canFlip && <DockButton icon="refresh-ccw" active={false} onPress={flipCamera} label={t('Switch camera')} />}
              {wide && canShare && (
                <DockButton icon="monitor" active={call.sharingScreen} onPress={toggleScreenShare} label={call.sharingScreen ? t('Stop sharing') : t('Share screen')} />
              )}
              <DockButton icon="message-square" active={panel === 'chat'} onPress={() => toggle('chat')} label={t('Call chat')} badge={panel === 'chat' ? 0 : call.chatUnread} />
              {wide ? (
                <>
                  <DockButton icon="headphones" active={panel === 'audio'} onPress={() => toggle('audio')} label={t('Audio devices')} />
                  <DockButton icon="sliders" active={panel === 'quality'} onPress={() => toggle('quality')} label={t('Call quality')} />
                  {canInvite && <DockButton icon="user-plus" active={panel === 'invite'} onPress={() => toggle('invite')} label={t('Invite to call')} />}
                  {!!call.room && <DockButton icon={linkCopied ? 'check' : 'link'} active={linkCopied} onPress={() => void copyMeetingLink()} label={t('Copy meeting link')} />}
                </>
              ) : (
                <DockButton icon="more-horizontal" active={panel === 'more' || call.sharingScreen} onPress={() => toggle('more')} label={t('More options')} />
              )}
            </View>
            <Pressable
              accessibilityLabel={t('Hang up')}
              onPress={hangUp}
              style={({ pressed }) => ({
                width: wide ? 72 : 64,
                height: wide ? 64 : 60,
                borderRadius: 32,
                backgroundColor: pressed ? '#B91C1C' : colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.danger,
                shadowOpacity: 0.55,
                shadowRadius: 18,
                elevation: 8,
              })}>
              <Icon name="phone-off" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {localPreview && (
        <SelfView
          stage={stage}
          topReserve={insets.top + (wide ? 16 : 108)}
          bottomReserve={dockHeight + insets.bottom + 8}
          speaking={!!call.localSpeaking}
          onPress={() => call.sharingScreen && setFocusedScreen('local')}>
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
        </SelfView>
      )}

      {panel === 'chat' && <CallChatPanel onClose={() => setPanel(null)} />}
      {panel === 'quality' && <CallQualityPanel onClose={() => setPanel(null)} />}
      {panel === 'invite' && <CallInvitePanel onClose={() => setPanel(null)} />}
      {panel === 'audio' && <AudioDevicePanel onClose={() => setPanel(null)} />}
      {panel === 'mic' && <MicPanel onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} />}
      {panel === 'more' && <MoreSheet items={moreItems} onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} />}
    </View>
  );
}

/** One reaction drifting up the whole call screen, swaying side to side, with who sent it. */
function FloatingReaction({ reaction, stage }: { reaction: CallReaction; stage: { width: number; height: number } }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: REACTION_MS, easing: Easing.out(Easing.sin), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [progress]);
  const height = stage.height || 600;
  const width = stage.width || 400;
  // Start around the middle; sway width and direction come with the reaction.
  const startX = width / 2 - 40 + reaction.drift * Math.min(120, width / 4);
  const sway = (24 + Math.abs(reaction.drift) * 26) * (reaction.drift < 0 ? -1 : 1);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: height - 140,
        width: 80,
        alignItems: 'center',
        opacity: progress.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -(height - 120)] }) },
          { translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, sway, 0, -sway, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0.4, 1.1, 0.9] }) },
        ],
      }}>
      <T style={{ fontSize: 44, lineHeight: 54 }}>{reaction.emoji}</T>
      {!!reaction.name && (
        <View style={[styles.glass, { paddingHorizontal: 8, paddingVertical: 2, maxWidth: 120 }]}>
          <T variant="labelSm" numberOfLines={1}>
            {reaction.name}
          </T>
        </View>
      )}
    </Animated.View>
  );
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
// Remembered for the rest of the session, across calls.
let selfCorner: Corner = 'tr';

type CornerGeometry = { spot: (corner: Corner) => { x: number; y: number }; stage: { width: number; height: number }; w: number; h: number };

/** Drag state for the self view; snaps to the corner nearest to where it was let go. */
function createCornerDrag(start: { x: number; y: number }) {
  const pos = new Animated.ValueXY(start);
  let geo: CornerGeometry | null = null;
  let dragging = false;
  let origin = { x: 0, y: 0 };
  const snap = (x: number, y: number) => {
    dragging = false;
    if (!geo) return;
    const cx = x + geo.w / 2;
    const cy = y + geo.h / 2;
    selfCorner = `${cy < geo.stage.height / 2 ? 't' : 'b'}${cx < geo.stage.width / 2 ? 'l' : 'r'}` as Corner;
    Animated.spring(pos, { toValue: geo.spot(selfCorner), useNativeDriver: false, friction: 7, tension: 60 }).start();
  };
  const responder = PanResponder.create({
    // Only real drags; a tap still reaches the preview.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderGrant: () => {
      dragging = true;
      pos.stopAnimation((value) => (origin = value));
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => pos.setValue({ x: origin.x + g.dx, y: origin.y + g.dy }),
    onPanResponderRelease: (_, g) => snap(origin.x + g.dx, origin.y + g.dy),
    onPanResponderTerminate: (_, g) => snap(origin.x + g.dx, origin.y + g.dy),
  });
  return {
    pos,
    responder,
    update(next: CornerGeometry) {
      const moved = !geo || next.spot(selfCorner).x !== geo.spot(selfCorner).x || next.spot(selfCorner).y !== geo.spot(selfCorner).y;
      geo = next;
      if (moved && !dragging) pos.setValue(next.spot(selfCorner));
    },
  };
}

/** The local camera / screen preview. Drag it anywhere; it snaps to the nearest corner. */
function SelfView({
  stage,
  topReserve,
  bottomReserve,
  speaking,
  onPress,
  children,
}: {
  stage: { width: number; height: number };
  topReserve: number;
  bottomReserve: number;
  speaking: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const w = wide ? 200 : 112;
  const h = wide ? 130 : 160;
  const spot = (corner: Corner) => {
    const m = 16;
    const left = corner === 'tl' || corner === 'bl';
    const top = corner === 'tl' || corner === 'tr';
    return {
      x: left ? insets.left + m : Math.max(m, stage.width - insets.right - m - w),
      y: top ? topReserve : Math.max(topReserve, stage.height - bottomReserve - h),
    };
  };
  const [drag] = useState(() => createCornerDrag(spot(selfCorner)));
  // Keep the geometry current and follow the layout (rotation, resizes, dock height) while resting in a corner.
  useEffect(() => drag.update({ spot, stage, w, h }));
  const { pos, responder } = drag;

  if (!stage.width) return null;
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.pip,
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: w,
          height: h,
          borderColor: speaking ? colors.amber : colors.hairline,
          borderWidth: 2,
          transform: pos.getTranslateTransform(),
        },
        Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none', touchAction: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' } as object) : null,
      ]}>
      <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel={t('Your video — drag to move')}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Mic toggle with a small handle that opens the microphone settings. */
function MicButton({ muted, panelOpen, onToggle, onOpenPanel }: { muted: boolean; panelOpen: boolean; onToggle: () => void; onOpenPanel: () => void }) {
  return (
    <View>
      <DockButton icon={muted ? 'mic-off' : 'mic'} active={!muted} danger={muted} onPress={onToggle} label={muted ? t('Unmute') : t('Mute')} />
      <Pressable
        accessibilityLabel={t('Microphone settings')}
        onPress={onOpenPanel}
        hitSlop={6}
        style={({ pressed }) => ({
          position: 'absolute',
          end: -4,
          bottom: -4,
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.canvas,
          backgroundColor: panelOpen ? colors.amber : pressed ? colors.surfaceHigh : colors.surfaceHighest,
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <Icon name={panelOpen ? 'chevron-down' : 'chevron-up'} size={13} color={panelOpen ? colors.onAmber : colors.text} />
      </Pressable>
    </View>
  );
}

/** Microphone popover: noise cancellation and the input device. */
function MicPanel({ onClose, bottom }: { onClose: () => void; bottom: number }) {
  const { call, setNoiseMode, refreshAudioDevices, selectAudioInput } = useCalls();
  useEffect(() => {
    void refreshAudioDevices();
  }, [refreshAudioDevices]);
  const inputs = call.audioDevices.filter((device) => device.kind === 'input');
  const on = call.noiseMode !== 'off';
  const strong = strongNoiseSupported();
  const toggleNoise = () => {
    if (on) return setNoiseMode('off');
    const preferred = getNoisePreference();
    setNoiseMode(preferred !== 'off' ? preferred : strong ? 'strong' : 'standard');
  };
  return (
    <Popover title={t('Microphone')} onClose={onClose} bottom={bottom}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        onPress={toggleNoise}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh,
        })}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: on ? colors.amber : colors.textMuted,
            backgroundColor: on ? colors.amber : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {on && <Icon name="check" size={14} color={colors.onAmber} />}
        </View>
        <View style={{ flex: 1 }}>
          <T variant="labelLg">{t('Noise cancellation')}</T>
          <T variant="bodySm" color={colors.textMuted}>
            {t('Filters out keyboard, fan and background noise.')}
          </T>
        </View>
      </Pressable>
      {on && strong && (
        <ChoiceRow
          values={['standard', 'strong'] as const}
          value={call.noiseMode === 'strong' ? 'strong' : 'standard'}
          label={t('Strength')}
          display={(v) => (v === 'strong' ? t('Strong (AI)') : t('Standard'))}
          onChange={(v) => setNoiseMode(v)}
        />
      )}
      {inputs.length > 0 && <DeviceSection title={t('Microphone input')} icon="mic" devices={inputs} selected={call.audioInputId} onSelect={selectAudioInput} />}
    </Popover>
  );
}

type MenuItem = { icon: IconName; label: string; active?: boolean; onPress: () => void };

/** Phone overflow menu for the controls that don't need to be one tap away. */
function MoreSheet({ items, onClose, bottom }: { items: MenuItem[]; onClose: () => void; bottom: number }) {
  return (
    <Popover onClose={onClose} bottom={bottom}>
      <View style={{ gap: 2 }}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 52,
              paddingHorizontal: 10,
              borderRadius: radius.lg,
              backgroundColor: pressed ? colors.surfaceHighest : item.active ? colors.amberTint : 'transparent',
            })}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: item.active ? 'rgba(255,184,77,0.22)' : colors.surfaceHigh,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name={item.icon} size={18} color={item.active ? colors.amberText : colors.text} />
            </View>
            <T variant="labelLg" color={item.active ? colors.amberText : colors.text} style={{ flex: 1 }}>
              {item.label}
            </T>
          </Pressable>
        ))}
      </View>
    </Popover>
  );
}

/** A panel that opens just above the dock, centered. */
function Popover({ title, onClose, bottom, children }: { title?: string; onClose: () => void; bottom: number; children: ReactNode }) {
  return (
    <View
      style={[
        styles.popover,
        { bottom: bottom + 4 },
        Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(0,0,0,0.5)' } as object) : null,
      ]}>
      {!!title && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingStart: 4 }}>
          <T variant="headlineSm" style={{ flex: 1 }}>
            {title}
          </T>
          <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ padding: 6 }}>
            <Icon name="x" />
          </Pressable>
        </View>
      )}
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }}>
        {children}
      </ScrollView>
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
              style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 2, borderColor: r.speaking ? colors.amber : colors.hairline }}>
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
                  <Icon name="maximize-2" size={13} color={colors.amberText} />
                  <T variant="label" color={colors.amberText}>{t('Open screen')}</T>
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
  const { call } = useCalls();
  const isSpeaking = (id: string | undefined) => id === localUser?.id ? call.localSpeaking : remotes.find((remote) => remote.userId === id)?.speaking;
  return (
    <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', direction: 'ltr', paddingTop: 88, paddingBottom: 150, paddingHorizontal: 10, gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#05070A', borderWidth: 2, borderColor: isSpeaking(owner?.id) ? colors.amber : colors.hairline }}>
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
        style={{ width: 76, flexGrow: 0, flexShrink: 0, flexBasis: 76 }}
        contentContainerStyle={{ alignItems: 'center', gap: 12, paddingVertical: 4 }}
        showsVerticalScrollIndicator={false}>
        {[localUser, ...remotes.map((remote) => remote.user)].filter((person) => person && person.id !== owner?.id).map((person) => (
          <View
            key={person!.id}
            style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: isSpeaking(person!.id) ? colors.amber : colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
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
            <T variant="label" color={item === value ? colors.amberText : colors.text}>{display?.(item) ?? String(item)}</T>
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
      <View style={{ gap: 6 }}>
        <ChoiceRow values={rates} value={call.voiceBitrate} label={t('Voice quality')} display={(v) => `${v} Kbps`} onChange={(v) => void setVoiceBitrate(v)} />
        <T variant="bodySm" color={colors.textMuted}>{t('Applies to everyone in this call.')}</T>
      </View>
      {call.sharingScreen ? (
        <>
          <ChoiceRow
            values={qualities}
            value={call.streamQuality}
            label={t('Screen share quality')}
            display={(v) => v === '2k' ? `2K · ${STREAM_PRESETS[v].width}×${STREAM_PRESETS[v].height}` : v.toUpperCase()}
            onChange={(v) => void setStreamQuality(v)}
          />
          <ChoiceRow values={fps} value={call.streamFps} label={t('Screen share FPS')} display={(v) => `${v} FPS`} onChange={(v) => void setStreamFps(v)} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceHigh }}>
          <Icon name="monitor" size={16} color={colors.textMuted} />
          <T variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>{t('Screen share quality and FPS appear here once you start sharing your screen.')}</T>
        </View>
      )}
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
        <Icon name={icon} size={16} color={colors.amberText} />
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
          <Icon name={busy === device.id ? 'loader' : selected === device.id ? 'check-circle' : 'circle'} size={17} color={selected === device.id ? colors.amberText : colors.textMuted} />
          <T variant="body" style={{ flex: 1 }} numberOfLines={2}>{device.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

function AudioDevicePanel({ onClose }: { onClose: () => void }) {
  const { call, refreshAudioDevices, selectAudioInput, selectAudioOutput, setParticipantVolume } = useCalls();
  useEffect(() => { void refreshAudioDevices(); }, [refreshAudioDevices]);
  const inputs = call.audioDevices.filter((device) => device.kind === 'input');
  const outputs = call.audioDevices.filter((device) => device.kind === 'output');
  return (
    <PanelShell title={t('Audio devices')} onClose={onClose}>
      <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ gap: 20 }}>
        {call.remotes.length > 0 && <T variant="labelLg">{t('Participant volume')}</T>}
        {call.remotes.map((remote) => (
          <View key={remote.userId} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name={(remote.volume ?? 1) === 0 ? 'volume-x' : (remote.volume ?? 1) < 0.5 ? 'volume-1' : 'volume-2'} size={16} color={colors.textMuted} />
              <T variant="label" style={{ flex: 1 }} numberOfLines={1}>{remote.user?.displayName ?? t('Someone')}</T>
              <T variant="label" color={colors.amberText} style={{ fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }}>{num(Math.round((remote.volume ?? 1) * 100))}%</T>
            </View>
            <Slider value={remote.volume ?? 1} label={t('Volume of {name}', { name: remote.user?.displayName ?? t('Someone') })} onChange={(value) => setParticipantVolume(remote.userId, value)} />
          </View>
        ))}
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
  const { self: user } = useCalls();
  const conversation = useConversation(call.conversationId ?? undefined);
  const [users, setUsers] = useState<User[]>([]);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.contacts().then((items) => active && setUsers(items)).catch((e) => active && setError(e instanceof Error ? e.message : t('Could not load people'))).finally(() => active && setLoading(false));
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

function DockButton({ icon, active, onPress, label, badge = 0, danger }: { icon: IconName; active: boolean; onPress: () => void; label: string; badge?: number; danger?: boolean }) {
  const wide = useIsWide();
  const size = wide ? 54 : 50;
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      {...(Platform.OS === 'web' ? ({ title: label } as object) : {})}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: danger ? colors.dangerTint : active ? 'rgba(255,184,77,0.22)' : pressed ? colors.surfaceHighest : colors.surfaceHigh,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}>
      <Icon name={icon} size={22} color={danger ? colors.danger : active ? colors.amberText : colors.text} />
      {badge > 0 && <UnreadBadge count={badge} style={{ position: 'absolute', top: 2, end: 2 }} />}
    </Pressable>
  );
}

// Rebuilt when the theme changes, since the tokens are read when the sheet is made.
const makeStyles = () => StyleSheet.create({
  glass: {
    backgroundColor: colors.glass,
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
    backgroundColor: colors.panel,
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
  popover: {
    position: 'absolute',
    alignSelf: 'center',
    width: 360,
    maxWidth: '94%',
    maxHeight: '70%',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.panel,
    elevation: 18,
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
    backgroundColor: colors.panel,
    elevation: 18,
  },
});
let styles = makeStyles();
onThemeChange(() => {
  styles = makeStyles();
});
