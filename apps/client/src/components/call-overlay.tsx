import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { api } from '@/lib/api';
import { meetingLink } from '@/lib/config';
import { timer } from '@/lib/format';
import { setImmersive } from '@/lib/immersive';
import { canSwitchCamera, ROUTE_PREFIX } from '@/lib/native-media';
import { enterPip, exitPip, pipAvailable, useAutoPip } from '@/lib/pip';
import { enterNativePip, nativePipSupported, useInNativePip, useNativeAutoPip } from '@/lib/native-pip';
import { getNoisePreference, strongNoiseSupported } from '@/lib/noise';
import { setCallChatSounds, setReactionSounds, useCallSoundSettings } from '@/lib/call-sounds';
import { REACTION_MS, STREAM_PRESETS, useCalls, type CallChatMessage, type CallReaction, type CallRemote, type NetQuality, type StreamFps, type StreamQuality, type VoiceBitrate } from '@/state/calls';
import { useConversation } from '@/state/chat-store';
import { colors, onThemeChange, radius } from '@/theme';
import { Avatar, ConversationAvatar } from './avatar';
import { Button, HandIcon, Icon, T, Tooltip, type IconName, UnreadBadge } from './ui';
import type { User } from '@/lib/types';
import { CallChatPanel } from './call-chat';
import { TypingDots } from './typing-dots';
import { RemoteAudio } from './remote-audio';
import { Slider } from './slider';
import { VideoView } from './video-view';
import { isRTL, num, t } from '@/lib/i18n';
import { playTestTone } from '@/lib/test-tone';
import { LevelMeter } from './call/level-meter';

const REACTIONS = ['❤️', '👏', '💡', '🔥', '✨'];

/** Width of the call chat when it is pinned beside the stage. */
const CALL_CHAT_DOCK_WIDTH = 340;

/** Small badge for a weak connection (nothing while it's fine): amber = weak, red = very weak. */
function NetBadge({ q, size = 22, style, label }: { q?: NetQuality; size?: number; style?: object; label?: string }) {
  if (!q || q === 'good') return null;
  const color = q === 'poor' ? colors.danger : colors.amber;
  const text = label ?? (q === 'poor' ? t('Very weak connection') : t('Weak connection'));
  return (
    <Tooltip label={text}>
      <View
        accessibilityRole="image"
        accessibilityLabel={text}
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' },
          style,
        ]}>
        <Icon name={q === 'poor' ? 'wifi-off' : 'wifi'} size={Math.round(size * 0.55)} color={color} />
      </View>
    </Tooltip>
  );
}

/** Tooltip text for a connection badge: which side is weak, and how weak. */
function netBadgeLabel(q: NetQuality | undefined, who?: string | null) {
  if (!q || q === 'good') return '';
  if (who === 'you') return q === 'poor' ? t('Your connection is very weak') : t('Your connection is weak');
  if (who) return q === 'poor' ? t("{name}'s connection is very weak", { name: who }) : t("{name}'s connection is weak", { name: who });
  return q === 'poor' ? t('Very weak connection') : t('Weak connection');
}

/** What a call is called: the group's title, or for a direct call the other person's name. */
function callName(call: { isGroup: boolean; title: string; peer: User | null }, other?: User | null) {
  if (call.isGroup) return call.title;
  return other?.displayName ?? call.peer?.displayName ?? call.title;
}

export function CallOverlay() {
  const { call } = useCalls();
  // Android app: during a video call, leaving the app floats it in a small window (like Meet).
  const remoteVideo = call.remotes.find((r) => (r.video || r.screen) && !!r.stream?.getVideoTracks().length);
  const myVideo = !call.cameraOff && !!call.localStream?.getVideoTracks().length;
  useNativeAutoPip(call.phase === 'active' && (!!remoteVideo || myVideo), !!remoteVideo?.screen);
  const inPip = useInNativePip();
  if (call.phase === 'idle') return null;
  if (inPip && call.phase === 'active') return <PipCall />;
  const minimized = call.phase === 'active' && call.minimized;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="box-none">
      {minimized ? (
        <MiniCall />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}>{call.phase === 'active' ? <ActiveCall /> : <RingingCall />}</View>
      )}
      {/* One persistent audio output per participant (web) — it keeps playing while minimized. */}
      {call.phase === 'active' &&
        call.remotes.map((r) => (
          <RemoteAudio
            key={r.userId}
            stream={r.stream}
            version={call.mediaVersion}
            outputDeviceId={call.audioOutputId}
            // The speaker button silences everyone, on top of each person's own volume.
            volume={call.speakerMuted ? 0 : (r.volume ?? 1)}
          />
        ))}
    </View>
  );
}

/** What the floating Android window shows: just the other person's video (or mine, or their picture). */
function PipCall() {
  const { call } = useCalls();
  const remote = call.remotes.find((r) => (r.video || r.screen) && !!r.stream?.getVideoTracks().length);
  const stream = remote?.stream ?? (!call.cameraOff ? call.localStream : null);
  const person = remote?.user ?? call.remotes[0]?.user ?? call.peer;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
      {stream ? (
        <VideoView key={`pip-${call.mediaVersion}-${stream.id}`} stream={stream} mirror={!remote && call.frontCamera} contain={!!remote?.screen} />
      ) : (
        <Avatar user={person} size={64} showPresence={false} />
      )}
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
  /** The window size when `box` was measured. */
  let boxScreen = { width: 0, height: 0 };
  let screen = { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
  /**
   * Where the window sits now, before the drag offset. On the web onLayout only fires when its size
   * changes (a ResizeObserver), not when a rotation moves it, so the measured spot is shifted by the
   * change in window size: it's anchored to the bottom and the end (the right edge; the left in
   * Persian). Using the stale spot pushed it off a phone turned back to portrait (user report).
   */
  const anchored = (): LayoutRectangle | null => {
    // Native onLayout reports moves too, so its measurement is already current.
    if (!box || !boxScreen.width || Platform.OS !== 'web') return box;
    const dx = isRTL() ? 0 : screen.width - boxScreen.width;
    return { ...box, x: box.x + dx, y: box.y + screen.height - boxScreen.height };
  };
  const clamp = (x: number, y: number) => {
    const b = anchored();
    if (!b || !screen.width) return { x, y };
    const m = 8;
    return {
      x: Math.min(Math.max(x, screen.left + m - b.x), screen.width - screen.right - m - b.width - b.x),
      y: Math.min(Math.max(y, screen.top + m - b.y), screen.height - screen.bottom - m - b.height - b.y),
    };
  };
  const settle = (x: number, y: number) => {
    offset = clamp(x, y);
    pan.setValue(offset);
  };
  // Browsers still fire a click after the mouse is released at the end of a drag.
  let draggedAt = 0;
  const release = (x: number, y: number) => {
    draggedAt = Date.now();
    settle(x, y);
  };
  const responder = PanResponder.create({
    // Capture only real drags so taps still reach the buttons underneath.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => pan.setValue(clamp(offset.x + g.dx, offset.y + g.dy)),
    onPanResponderRelease: (_, g) => release(offset.x + g.dx, offset.y + g.dy),
    onPanResponderTerminate: (_, g) => release(offset.x + g.dx, offset.y + g.dy),
  });
  return {
    /** True right after a drag ended: ignore the click that comes with letting go. */
    justDragged: () => Date.now() - draggedAt < 350,
    handlers: responder.panHandlers,
    transform: pan.getTranslateTransform(),
    setScreen: (next: typeof screen) => {
      // Measured before the window size was known: it was measured in this window.
      if (box && !boxScreen.width) boxScreen = { width: next.width, height: next.height };
      screen = next;
      settle(offset.x, offset.y);
    },
    onLayout: (e: LayoutChangeEvent) => {
      box = e.nativeEvent.layout;
      boxScreen = { width: screen.width, height: screen.height };
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
  const { call, toggleMic, hangUp, setMinimized, setMiniPreview } = useCalls();
  const { self: user } = useCalls();
  const wide = useIsWide();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const elapsed = useElapsed(call.answeredAt);
  const withVideo = call.remotes.find((r) => r.video && r.stream?.getVideoTracks().length);
  // A live thumbnail of whoever is streaming (screen or camera); the viewer can hide it for the rest of the call.
  const preview = !!withVideo && call.miniPreview;
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
        <Pressable onPress={() => !drag.justDragged() && setMinimized(false)} accessibilityLabel={t('Return to call')}>
          {preview && withVideo ? (
            <View style={{ height: wide ? 130 : 110, backgroundColor: colors.rail }}>
              <VideoView key={`mini-${withVideo.userId}-${call.mediaVersion}`} stream={withVideo.stream} contain={withVideo.screen} overlay />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 6 }}>
            {!preview && <Avatar user={shown?.user ?? call.peer} size={36} showPresence={false} ring={shown?.speaking ? colors.amber : colors.hairline} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {callName(call, shown?.user)}
                </T>
                <NetBadge q={shown?.net} size={18} label={netBadgeLabel(shown?.net, shown?.user?.displayName)} />
              </View>
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
        <MiniButton icon={call.micMuted ? 'mic-off' : 'mic'} active={!call.micMuted} ring={!!call.localSpeaking} onPress={toggleMic} label={t('Microphone')} />
        {!!withVideo && (
          <MiniButton
            icon={call.miniPreview ? 'eye' : 'eye-off'}
            active={call.miniPreview}
            onPress={() => setMiniPreview(!call.miniPreview)}
            label={call.miniPreview ? t('Hide video preview') : t('Show video preview')}
          />
        )}
        {call.isGroup && (
          <MiniButton icon="users" active={peopleOpen} onPress={() => setPeopleOpen((open) => !open)} label={t('Show participants')} />
        )}
        <MiniButton icon="maximize-2" active={false} onPress={() => !drag.justDragged() && setMinimized(false)} label={t('Return to call')} />
        <Tooltip label={t('Hang up')}>
          <Pressable
            accessibilityLabel={t('Hang up')}
            onPress={hangUp}
            style={({ pressed, hovered }: any) => ({
              width: 52,
              height: 40,
              borderRadius: 20,
              // Like Leave group: a tinted surface with a red icon, not a loud red fill.
              backgroundColor: pressed || hovered ? colors.dangerTintStrong : colors.dangerTint,
              alignItems: 'center',
              justifyContent: 'center',
            })}>
            <Icon name="phone-off" size={18} color={colors.danger} />
          </Pressable>
        </Tooltip>
      </View>
    </Animated.View>
  );
}

function MiniButton({ icon, active, onPress, label, ring }: { icon: IconName; active: boolean; onPress: () => void; label: string; ring?: boolean }) {
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed, hovered }: any) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          // Lights up while I'm talking (others see the same on my avatar).
          borderWidth: 2,
          borderColor: ring ? colors.amber : 'transparent',
          backgroundColor: active ? colors.amberGlow : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <Icon name={icon} size={18} color={active ? colors.amberText : colors.text} />
      </Pressable>
    </Tooltip>
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
  // A phone held sideways has very little height: the avatar and the type shrink so the
  // accept/decline buttons always stay on screen (user report).
  const { width, height } = useWindowDimensions();
  const compact = height < 560;
  const landscape = compact && width > height;
  const actionSize = compact ? 58 : 72;
  // Only the middle block gives way, so the buttons always keep their room: the ring follows
  // whatever height is left after the name and the line under it (a phone held sideways).
  // Start from an estimate of the room the middle block gets, so the ring never has to jump from one
  // size to another on the first frame (user report). The real measurement only fine-tunes it, under
  // a short fade, so the correction is never visible.
  const [middleHeight, setMiddleHeight] = useState(() => Math.max(0, height - (compact ? 210 : 360)));
  const textHeight = compact ? 84 : 150;
  const ringSize = landscape
    ? Math.max(72, Math.min(150, height - 210))
    : Math.max(72, Math.min(240, (middleHeight || (compact ? 150 : 240)) - textHeight));
  const avatarSize = Math.round(ringSize * 0.75);
  const [ringFade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(ringFade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [ringFade]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const badge = (
    <>
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
    </>
  );
  const ring = (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: compact ? 12 : 18,
          borderColor: colors.amberGlow,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: ringSize - 10,
          height: ringSize - 10,
          borderRadius: (ringSize - 10) / 2,
          borderWidth: compact ? 10 : 14,
          borderColor: colors.amberGlow,
        }}
      />
      {call.isGroup && conversation ? (
        <ConversationAvatar conversation={conversation} meId={user?.id} size={avatarSize} />
      ) : (
        <Avatar user={call.peer} size={avatarSize} ring={colors.teal} ringBg={colors.canvas} />
      )}
    </View>
  );
  const identity = (
    <>
      <T variant="display" style={{ fontSize: compact ? 26 : 40, textAlign: 'center' }}>
        {callName(call)}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T variant="bodyLg" color={colors.amberSoftText} style={{ fontSize: compact ? 15 : 18, textAlign: 'center' }}>
          {incoming
            ? call.isGroup && call.peer
              ? t('{name} is calling the group', { name: call.peer.displayName })
              : call.video
                ? t('Flock Video Calling')
                : t('Flock Voice Calling')
            : t('Ringing')}
        </T>
        {!incoming && <TypingDots size={5} color={colors.amberText} />}
        <Icon name="bar-chart-2" size={18} color={colors.amberText} />
      </View>
      {!compact && !call.isGroup && !!call.peer?.title && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
          <Icon name="briefcase" size={14} color={colors.textMuted} />
          <T variant="body" color={colors.amberSoftText}>
            {call.peer.title}
          </T>
        </View>
      )}
    </>
  );
  const quick = (
    <>
      {incoming && (
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { icon: 'message-square' as const, text: t("Can't talk right now") },
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
    </>
  );
  const actions = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' }}>
        {incoming ? (
          <>
            <RoundAction icon="phone-off" label={t('Decline')} bg={colors.dangerDeep} color={colors.dangerText} glow={colors.danger} size={actionSize} onPress={() => decline()} />
            {call.video && (
              <View style={{ paddingTop: compact ? 4 : 10 }}>
                <RoundAction icon="video-off" label={t('Audio only')} bg={colors.surfaceHigh} size={Math.round(actionSize * 0.72)} onPress={() => accept(true)} />
              </View>
            )}
            <RoundAction
              icon={call.video ? 'video' : 'phone'}
              label={t('Accept')}
              bg={colors.online}
              color="#003824"
              glow={colors.accept}
              size={actionSize}
              onPress={() => accept()}
            />
          </>
        ) : (
          <RoundAction icon="phone-off" label={t('Cancel')} bg={colors.dangerDeep} color={colors.dangerText} glow={colors.danger} size={actionSize} onPress={hangUp} />
        )}
      </View>
      {!!call.notice && <Notice text={call.notice} />}
    </>
  );

  // A phone held sideways: who is calling on one side, the answers on the other, so nothing has to
  // squeeze into the little height left (user report: the status ran into the avatar).
  if (landscape) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <LinearGradient colors={[colors.amberTint, `${colors.canvas}00`]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '60%' }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, gap: 24, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
          <Animated.View style={{ flex: 1, alignItems: 'center', gap: 8, opacity: ringFade }}>
            {badge}
            {ring}
            {identity}
          </Animated.View>
          <View style={{ flex: 1, gap: 18, justifyContent: 'center' }}>
            {quick}
            {actions}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={[colors.amberTint, `${colors.canvas}00`]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '60%' }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: compact ? 14 : 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8, paddingTop: compact ? 4 : 16 }}>
          {badge}
        </View>

        <Animated.View
          style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: compact ? 8 : 14, opacity: ringFade }}
          onLayout={(e) => setMiddleHeight(e.nativeEvent.layout.height)}>
          {ring}
          {identity}
        </Animated.View>

        <View style={{ width: '100%', gap: compact ? 14 : 32, paddingBottom: 12 }}>
          {quick}
          {actions}
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

const TOAST_MS = 4500;
/** How long the controls a tap brought up stay before they fade away over a shared screen. */
const CONTROLS_HIDE_MS = 4000;
/** One duration and one curve for the controls: they fade, and the stage and its pills follow them. */
const CHROME_MS = 240;
const CHROME_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** A style the browser transitions by itself; null on a phone, where Animated does the same work. */
const webTransition = (...props: string[]) =>
  Platform.OS === 'web' ? { transition: props.map((p) => `${p} ${CHROME_MS}ms ${CHROME_EASE}`).join(', ') } : null;

/**
 * The controls' fade as one value: null in the browser, where the transition above is enough, and an
 * Animated value on a phone, which the stage padding rides too (padding can't be driven natively).
 */
function useChromeFade(hidden: boolean) {
  const web = Platform.OS === 'web';
  const [fade] = useState(() => new Animated.Value(hidden ? 0 : 1));
  useEffect(() => {
    if (web) return;
    Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: CHROME_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [hidden, fade, web]);
  return web ? null : fade;
}

/**
 * Messages that arrive in the call chat while it is closed: a short card above the controls that
 * fades out by itself (tap opens the chat). Up to three at a time, newest at the bottom.
 */
function ChatToasts({ messages, hidden, bottom, onOpen }: { messages: CallChatMessage[]; hidden: boolean; bottom: number; onOpen: () => void }) {
  const [seen, setSeen] = useState(messages.length);
  const [toasts, setToasts] = useState<CallChatMessage[]>([]);
  // New messages are picked up while rendering (not in an effect), so nothing renders twice.
  if (messages.length !== seen) {
    setSeen(messages.length);
    const fresh = messages.length > seen ? messages.slice(seen).filter((m) => !m.mine) : [];
    if (!hidden && fresh.length) setToasts((list) => [...list, ...fresh].slice(-3));
  }
  if (hidden && toasts.length) setToasts([]);
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', start: 12, end: 12, bottom, alignItems: 'center', gap: 8, zIndex: 30 }}>
      {toasts.map((m) => (
        <ChatToast key={m.id} message={m} onOpen={onOpen} onDone={() => setToasts((list) => list.filter((x) => x.id !== m.id))} />
      ))}
    </View>
  );
}

function ChatToast({ message, onOpen, onDone }: { message: CallChatMessage; onOpen: () => void; onDone: () => void }) {
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => finished && onDone());
    }, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per toast
  }, []);
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }], maxWidth: 420, width: '100%' }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('Open call chat')}
        // Solid, not glass: it has to read over any video or shared screen.
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceHigh,
          borderWidth: 1,
          borderColor: colors.surfaceHighest,
          borderStartWidth: 3,
          borderStartColor: colors.amber,
          ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.45)' } as object) : { elevation: 8 }),
        }}>
        <View style={{ marginTop: 2 }}>
          <Icon name="message-square" size={16} color={colors.amberText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!message.author && (
            <T variant="label" color={colors.amberText} numberOfLines={1}>
              {message.author}
            </T>
          )}
          <T variant="body" numberOfLines={2}>
            {message.text}
          </T>
        </View>
      </Pressable>
    </Animated.View>
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

type Panel = 'chat' | 'quality' | 'invite' | 'audio' | 'mic' | 'more' | 'reactions' | 'cameras' | null;

/** Stitch "Active Video Call": full-bleed remote, draggable self view, glass control dock. */
function ActiveCall() {
  const { call, hangUp, toggleMic, toggleCamera, toggleScreenShare, flipCamera, sendReaction, setMinimized, toggleSpeakerMute, toggleRaiseHand, lowerHand } = useCalls();
  const { self: user } = useCalls();
  const wide = useIsWide();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Tap the stage to hide the controls (less visual noise), tap again to bring them back.
  const [controlsHidden, setControlsHidden] = useState(false);
  // They fade instead of snapping (user request), on phones as well as in the browser.
  const fade = useChromeFade(controlsHidden);
  const chrome = fade ? { opacity: fade } : { opacity: controlsHidden ? 0 : 1, ...webTransition('opacity') };
  /** I chose not to see my own camera (it still goes out to the others). */
  const [selfHidden, setSelfHidden] = useState(false);
  // One panel at a time.
  const [panel, setPanel] = useState<Panel>(null);
  // The chat can be pinned: it then docks to the side and the stage makes room for it.
  const [chatPinned, setChatPinned] = useState(false);
  const chatDocked = wide && chatPinned && panel === 'chat';
  const stageEnd = chatDocked ? CALL_CHAT_DOCK_WIDTH : 0;
  const toggle = (p: Exclude<Panel, null>) => setPanel((open) => (open === p ? null : p));
  // Popovers open right above the button that owns them: measure it first, then show.
  const [outX, outRef, measureOut] = useAnchor();
  const [reactX, reactRef, measureReact] = useAnchor();
  const [camX, camRef, measureCam] = useAnchor();
  const [micX, micRef, measureMic] = useAnchor();
  const [qualX, qualRef, measureQual] = useAnchor();
  const openAt = (measure: ReturnType<typeof useAnchor>[2], p: Exclude<Panel, null>) => {
    if (panel === p) return setPanel(null);
    measure(() => setPanel(p));
  };
  const [focusedScreen, setFocusedScreen] = useState<string | null>(null);
  // "Full width" on a shared screen collapses the participant strip so only the stream shows.
  // It is remembered per sharer and drops back to the normal layout when the screen closes.
  const [fullWidthSharer, setFullWidthSharer] = useState<string | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  // The stage area the call itself may use: everything except a pinned chat column.
  const stageBox = { width: Math.max(0, stage.width - stageEnd), height: stage.height };
  const [dockHeight, setDockHeight] = useState(180);
  const [headerHeight, setHeaderHeight] = useState(116);
  const chromePointer = controlsHidden ? 'none' : 'box-none';
  const elapsed = useElapsed(call.answeredAt);
  // Each participant announces when their video slot carries camera or screen.
  const hasVideo = (r: CallRemote) => r.video && !!r.stream?.getVideoTracks().length;
  const single = !call.isGroup && call.remotes.length <= 1 ? call.remotes[0] : undefined;
  const anyVideo = call.remotes.some(hasVideo) || !call.cameraOff || call.sharingScreen;
  // Video calls use the whole phone screen: status bar and navigation buttons hide (swipe from an edge to see them).
  useEffect(() => {
    setImmersive(anyVideo);
    return () => setImmersive(false);
  }, [anyVideo]);
  const anyScreen = call.remotes.some((r) => r.screen) || call.sharingScreen;
  const camOn = !call.cameraOff && !!call.localStream?.getVideoTracks().length;

  // Everyone on screen, me first.
  const people: Person[] = [
    {
      id: 'local',
      user,
      self: true,
      stream: camOn && !selfHidden ? call.localStream : null,
      video: camOn && !selfHidden,
      mirror: call.frontCamera,
      speaking: !!call.localSpeaking,
      audio: call.localStream,
      net: call.localNet,
      muted: call.micMuted,
      screen: call.sharingScreen,
      raised: call.raised,
    },
    ...call.remotes.map((r) => ({
      id: r.userId,
      user: r.user,
      stream: r.stream,
      video: hasVideo(r) && !r.screen,
      speaking: !!r.speaking,
      audio: r.stream,
      net: r.net,
      muted: r.muted,
      screen: r.screen && hasVideo(r),
      connecting: !r.stream,
      raised: call.raisedBy.includes(r.userId),
    })),
  ];
  if (!call.remotes.length) {
    people.push(
      call.isGroup || !call.peer
        ? { id: 'waiting', user: null, stream: null, video: false, placeholder: t('Waiting for others to join…') }
        : { id: 'peer', user: call.peer, stream: null, video: false, connecting: true },
    );
  }

  // A shared screen goes to the middle by itself; the minimize button on it hides it until someone else shares.
  const sharers = [...call.remotes.filter((r) => r.screen && hasVideo(r)).map((r) => r.userId), ...(call.sharingScreen ? ['local'] : [])];
  const [dismissedScreen, setDismissedScreen] = useState<string | null>(null);
  const shownScreen = focusedScreen && sharers.includes(focusedScreen) ? focusedScreen : (sharers.find((id) => id !== dismissedScreen) ?? null);
  const shownRemote = call.remotes.find((r) => r.userId === shownScreen);
  // A full-width shared screen takes the whole stage: the people strip collapses and is not shown,
  // so the viewer can watch the stream without the tiles beside it.
  // Someone's screen fills the stage: the controls a tap brings up fade away by themselves, so the
  // shared screen is never left half covered (user request). An open panel keeps them up.
  useEffect(() => {
    if (controlsHidden || panel || !shownScreen) return;
    const id = setTimeout(() => setControlsHidden(true), CONTROLS_HIDE_MS);
    return () => clearTimeout(id);
  }, [controlsHidden, panel, shownScreen]);
  const fullWidth = !!shownScreen && fullWidthSharer === shownScreen;
  const toggleFullWidth = () => setFullWidthSharer((current) => (current === shownScreen ? null : shownScreen));
  // One-to-one video: their camera fills the screen and mine floats in a corner.
  const fullBleed = !shownScreen && !!single && hasVideo(single) && !single.screen;
  // The front/back toggle sits on that floating preview; without it, it stays in the dock.
  const selfViewShown = fullBleed && camOn && !selfHidden;
  // With the controls hidden, the stage takes the room they leave. Both pads ride the fade above, so
  // the video grows with the controls instead of jumping (user report).
  // Clear the status pill and tags (they can wrap to a second line), with a little air below them.
  const padTopShown = insets.top + headerHeight + 6;
  const padTopHidden = insets.top + 12;
  const padBottomShown = dockHeight + insets.bottom + 4;
  const padBottomHidden = insets.bottom + 12;
  // The resting number the browser transitions, or the interpolation the phone animates.
  const pad = (shown: number, hidden: number) =>
    fade ? fade.interpolate({ inputRange: [0, 1], outputRange: [hidden, shown] }) : controlsHidden ? hidden : shown;
  const padTop = pad(padTopShown, padTopHidden);
  const padBottom = pad(padBottomShown, padBottomHidden);
  const stagePad = { paddingTop: padTop, paddingBottom: padBottom, ...webTransition('padding-top', 'padding-bottom') };
  // Overlays that only take a number (the floating self view) use the resting position.
  const padBottomNow = controlsHidden ? padBottomHidden : padBottomShown;

  // Meeting rooms are invited to by sharing their link; group calls by picking people.
  const canInvite = call.isGroup && !call.guest && !call.room;
  const [linkCopied, setLinkCopied] = useState(false);
  const copyMeetingLink = async () => {
    if (!call.room) return;
    await Clipboard.setStringAsync(meetingLink(call.room.code));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  // The other person's video floats in a small window when the user leaves the tab/app (web).
  const pipStream = call.remotes.find((r) => (r.video || r.screen) && !!r.stream?.getVideoTracks().length)?.stream ?? null;
  useAutoPip(pipStream, call.phase === 'active' && !!pipStream);
  const canPip = (pipAvailable && !!pipStream) || (nativePipSupported && (!!pipStream || camOn));
  // Front/back toggle: phones (native), and browsers that see more than one camera.
  const canFlip = (canSwitchCamera || (Platform.OS === 'web' && call.videoDevices.length > 1)) && !call.cameraOff;
  // A chevron on the camera button opens the camera list, like the mic and speaker buttons (web and
  // desktop; the phone apps flip front/back instead). Picking a camera also turns it on.
  const canSwitchCameras = Platform.OS === 'web';
  // Phones keep the essentials in the dock and the rest behind "More". Their buttons shrink a little
  // so five of them plus the hang-up button still fit on a small screen.
  // The front/back toggle joins the dock only when my floating preview (which carries it) isn't shown.
  const dockSize = wide ? 54 : Math.max(34, Math.min(46, Math.floor((windowWidth - 125) / (canFlip && !selfViewShown ? 6 : 5))));
  const raisedCount = (call.raised ? 1 : 0) + call.raisedBy.length;
  const raisedText =
    raisedCount > 1
      ? t('{count} people raised their hands', { count: num(raisedCount) })
      : call.raised
        ? t('You raised your hand')
        : t('{name} raised a hand', { name: call.remotes.find((r) => call.raisedBy.includes(r.userId))?.user?.displayName ?? t('Someone') });
  // Phones (Stitch "Call Controls & Options"): the dock holds mic, speaker, camera, chat and hang-up,
  // with raise hand and screen sharing on its second row; everything else is behind "More", whose
  // sheet opens with a row of quick reactions.
  const moreItems: MenuItem[] = [
    // Phones keep screen sharing here instead of on the dock.
    ...(!wide
      ? [{ icon: 'monitor' as const, label: call.sharingScreen ? t('Stop sharing') : t('Share screen'), active: call.sharingScreen, onPress: () => void toggleScreenShare() }]
      : []),
    ...(canPip ? [{ icon: 'minimize-2' as const, label: t('Picture in picture'), onPress: () => (nativePipSupported ? void enterNativePip() : void enterPip(pipStream)) }] : []),
    ...(camOn ? [{ icon: selfHidden ? ('eye' as const) : ('eye-off' as const), label: selfHidden ? t('Show my video') : t('Hide my video'), onPress: () => setSelfHidden((h) => !h) }] : []),
    { icon: 'sliders', label: t('Call quality'), onPress: () => setPanel('quality') },
    ...(canInvite ? [{ icon: 'user-plus' as const, label: t('Invite to call'), onPress: () => setPanel('invite') }] : []),
    ...(call.room ? [{ icon: 'link' as const, label: t('Copy meeting link'), onPress: () => void copyMeetingLink() }] : []),
    { icon: 'minimize-2', label: t('Minimize call'), onPress: () => setMinimized(true), full: true },
  ];
  // Phone dock: six equal columns across the panel (every gap between buttons the same).
  const tileSize = Math.max(38, Math.min(50, Math.floor((Math.min(windowWidth, 520) - 16 - 20) / 6) - 12));

  // Phone, others' cameras still off (the grid): the flip button sits on my own tile instead of the dock.
  const flipOnTile = !wide && canFlip && !selfHidden && !shownScreen && !(fullBleed && single);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }} onLayout={(e) => setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {/* Remote stage — tap closes an open panel, otherwise toggles the controls */}
      <Pressable
        style={[StyleSheet.absoluteFill, stageEnd ? { end: stageEnd } : null]}
        onPress={() => {
          // A pinned chat is part of the layout, not a popover: only its own close button shuts it.
          if (panel && !chatDocked) setPanel(null);
          else setControlsHidden((h) => !h);
        }}
        accessibilityLabel={t('Show or hide controls')}
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : {})}>
        {shownScreen ? (
          <ScreenStage
            stream={shownScreen === 'local' ? call.screenStream : shownRemote?.stream}
            ownerName={shownScreen === 'local' ? t('You') : (shownRemote?.user?.displayName ?? t('Someone'))}
            ownerSpeaking={shownScreen === 'local' ? !!call.localSpeaking : !!shownRemote?.speaking}
            people={people}
            version={call.mediaVersion}
            padStyle={stagePad}
            fullWidth={fullWidth}
          />
        ) : fullBleed && single ? (
          <View style={{ flex: 1, borderWidth: 2, borderColor: single.speaking ? colors.amber : 'transparent' }}>
            <VideoView key={`remote-${single.userId}-${call.mediaVersion}`} stream={single.stream} />
            <Animated.View style={[styles.glass, { position: 'absolute', start: 16, bottom: padBottom, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', gap: 6, alignItems: 'center' }, webTransition('bottom') as object]}>
              <T variant="label">{callName(call, single.user)}</T>
              {single.muted && <Icon name="mic-off" size={14} color={colors.danger} />}
              <NetBadge q={single.net} size={18} label={netBadgeLabel(single.net, single.user?.displayName)} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', end: 16, bottom: padBottom }, webTransition('bottom') as object]}>
              <LevelMeter stream={single.stream} speaking={single.speaking} version={call.mediaVersion} height={36} />
            </Animated.View>
          </View>
        ) : (
          <TileGrid
            people={people}
            version={call.mediaVersion}
            padStyle={stagePad}
            onFlip={flipOnTile ? flipCamera : undefined}
            onOpenScreen={(id) => {
              setDismissedScreen(null);
              setFocusedScreen(id);
            }}
          />
        )}
      </Pressable>

      {/* Reactions float from the bottom of the screen to the top */}
      <View style={[StyleSheet.absoluteFill, stageEnd ? { end: stageEnd } : null]} pointerEvents="none">
        {call.reactions.map((r) => (
          <FloatingReaction key={r.key} reaction={r} stage={stageBox} />
        ))}
      </View>

      <SafeAreaView style={[{ flex: 1, justifyContent: 'space-between' }, stageEnd ? { marginEnd: stageEnd } : null]} pointerEvents="box-none">
        {/* Top status */}
        <Animated.View
          style={[{ padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, chrome]}
          pointerEvents={chromePointer}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <View style={{ flex: 1, minWidth: 0, gap: 8, alignItems: 'flex-start' }}>
            <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingStart: 16, paddingEnd: 6, paddingVertical: 6, maxWidth: '100%' }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber }} />
              <T variant="labelLg" style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>
                {timer(elapsed)}
              </T>
              <T variant="labelLg" color={colors.textMuted}>
                •
              </T>
              <T variant="labelLg" style={{ fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
                {callName(call, single?.user)}
              </T>
              <Tooltip label={t('Minimize call')}>
                <Pressable
                  accessibilityLabel={t('Minimize call')}
                  onPress={() => setMinimized(true)}
                  hitSlop={8}
                  style={({ pressed }) => ({ padding: 7, borderRadius: 16, backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh })}>
                  <Icon name="minimize-2" size={16} color={colors.text} />
                </Pressable>
              </Tooltip>
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
              {!!call.localNet && call.localNet !== 'good' && (
                <View style={[styles.tag, { backgroundColor: call.localNet === 'poor' ? colors.dangerTint : colors.amberTint }]}>
                  <Icon name={call.localNet === 'poor' ? 'wifi-off' : 'wifi'} size={13} color={call.localNet === 'poor' ? colors.danger : colors.amberText} />
                  <T variant="label" color={call.localNet === 'poor' ? colors.danger : colors.amberText}>
                    {call.localNet === 'poor' ? t('Your connection is very weak') : t('Your connection is weak')}
                  </T>
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
          {/* A shared screen's own controls ride the header: they fade with the dock and sit in the top
              corner, clear of the stream and the people strip (user request). */}
          {!!shownScreen && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Tooltip label={fullWidth ? t('Show participants') : t('Full width')} side="bottom">
                <Pressable
                  onPress={toggleFullWidth}
                  accessibilityLabel={fullWidth ? t('Show participants') : t('Full width')}
                  style={({ hovered }: any) => [
                    styles.glass,
                    { height: 40, minWidth: 40, paddingHorizontal: wide ? 12 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
                    hovered ? { backgroundColor: colors.surfaceHighest } : null,
                  ]}>
                  <Icon name={fullWidth ? 'users' : 'maximize-2'} size={16} />
                  {wide && <T variant="label">{fullWidth ? t('Show participants') : t('Full width')}</T>}
                </Pressable>
              </Tooltip>
              <Tooltip label={t('Close focused screen')} side="bottom">
                <Pressable
                  onPress={() => {
                    setDismissedScreen(shownScreen);
                    setFocusedScreen(null);
                    setFullWidthSharer(null);
                  }}
                  accessibilityLabel={t('Close focused screen')}
                  style={({ hovered }: any) => [styles.glass, { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, hovered ? { backgroundColor: colors.surfaceHighest } : null]}>
                  <Icon name="minimize-2" size={18} />
                </Pressable>
              </Tooltip>
            </View>
          )}
        </Animated.View>

        {/* Bottom controls */}
        {/* Only the buttons set the stage's bottom space: notices and the raised-hand banner float above
            them over the video, so they never push the stage around. */}
        <Animated.View style={[{ padding: wide ? 12 : 8, gap: 10, alignItems: 'center' }, chrome]} pointerEvents={chromePointer}>
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
          {raisedCount > 0 && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: colors.amber }]}>
              <HandIcon size={18} color={colors.amberText} />
              <T variant="body" style={{ flexShrink: 1 }}>
                {raisedText}
              </T>
              {call.raised && (
                <Tooltip label={t('Lower hand')}>
                  <Pressable
                    onPress={lowerHand}
                    accessibilityLabel={t('Lower hand')}
                    style={({ pressed, hovered }: any) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      backgroundColor: pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
                    })}>
                    <T variant="label" color={colors.amberText}>
                      {t('Lower hand')}
                    </T>
                  </Pressable>
                </Tooltip>
              )}
            </View>
          )}
          <View onLayout={(e) => setDockHeight(e.nativeEvent.layout.height + (wide ? 24 : 16))} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
          {!wide ? (
            <View style={[styles.glass, { borderRadius: radius.xl, padding: 10, gap: 10, width: '100%', maxWidth: 520 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <DockTile label={call.micMuted ? t('Unmute') : t('Mute')} on={!call.micMuted}>
                  <View ref={micRef} collapsable={false}>
                    <MicButton muted={call.micMuted} speaking={!!call.localSpeaking} panelOpen={panel === 'mic'} onToggle={toggleMic} onOpenPanel={() => openAt(measureMic, 'mic')} size={tileSize} />
                  </View>
                </DockTile>
                <DockTile label={t('Speaker')} on={!call.speakerMuted}>
                  <View ref={outRef} collapsable={false}>
                    <OutputButton muted={call.speakerMuted} panelOpen={panel === 'audio'} onToggleMute={toggleSpeakerMute} onOpenPanel={() => openAt(measureOut, 'audio')} size={tileSize} />
                  </View>
                </DockTile>
                <DockTile label={t('Video')} on={!call.cameraOff}>
                  <View ref={camRef} collapsable={false}>
                    <CameraButton
                      off={call.cameraOff}
                      panelOpen={panel === 'cameras'}
                      onToggle={toggleCamera}
                      onOpenPanel={() => openAt(measureCam, 'cameras')}
                      canSwitch={canSwitchCameras}
                      size={tileSize}
                    />
                  </View>
                </DockTile>
                <DockTile label={t('Chat')} on={panel === 'chat'}>
                  <DockButton icon="message-square" active={panel === 'chat'} onPress={() => toggle('chat')} label={t('Call chat')} badge={panel === 'chat' ? 0 : call.chatUnread} size={tileSize} />
                </DockTile>
                <DockTile label={t('More')} on={panel === 'more' || call.sharingScreen}>
                  <DockButton icon="more-horizontal" active={panel === 'more' || call.sharingScreen} onPress={() => toggle('more')} label={t('More options')} size={tileSize} />
                </DockTile>
                <DockTile label={t('Leave')} danger>
                  <Pressable
                    accessibilityLabel={t('Hang up')}
                    onPress={hangUp}
                    style={({ pressed }) => ({
                      width: tileSize,
                      height: tileSize,
                      borderRadius: tileSize / 2,
                      backgroundColor: pressed ? colors.dangerTintStrong : colors.dangerTint,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    })}>
                    <Icon name="phone-off" size={Math.round(tileSize * 0.41)} color={colors.danger} />
                  </Pressable>
                </DockTile>
              </View>
              {(call.isGroup || (canFlip && !selfViewShown && !flipOnTile)) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {call.isGroup && <DockPill hand label={call.raised ? t('Lower hand') : t('Raise hand')} active={call.raised} onPress={toggleRaiseHand} />}
                  {canFlip && !selfViewShown && !flipOnTile && <DockPill icon="refresh-ccw" label={t('Flip')} onPress={flipCamera} />}
                </View>
              )}
            </View>
          ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 14 : 8, maxWidth: '100%' }}>
            {/* One panel like the phone dock: the same rounded corners, hang-up inside at the end. */}
            <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: wide ? 8 : 5, padding: wide ? 10 : 5, borderRadius: radius.xl, flexShrink: 1 }]}>
              <View ref={micRef} collapsable={false}>
                <MicButton muted={call.micMuted} speaking={!!call.localSpeaking} panelOpen={panel === 'mic'} onToggle={toggleMic} onOpenPanel={() => openAt(measureMic, 'mic')} size={dockSize} />
              </View>
              <View ref={outRef} collapsable={false}>
                <OutputButton muted={call.speakerMuted} panelOpen={panel === 'audio'} onToggleMute={toggleSpeakerMute} onOpenPanel={() => openAt(measureOut, 'audio')} size={dockSize} />
              </View>
              <View ref={camRef} collapsable={false}>
                <CameraButton
                  off={call.cameraOff}
                  panelOpen={panel === 'cameras'}
                  onToggle={toggleCamera}
                  onOpenPanel={() => openAt(measureCam, 'cameras')}
                  canSwitch={canSwitchCameras}
                  size={dockSize}
                />
              </View>
              {canFlip && !selfViewShown && <DockButton icon="refresh-ccw" active={false} onPress={flipCamera} label={t('Switch camera')} size={dockSize} />}
              {wide && (
                <DockButton icon="monitor" active={call.sharingScreen} onPress={() => void toggleScreenShare()} label={call.sharingScreen ? t('Stop sharing') : t('Share screen')} size={dockSize} />
              )}
              {wide && (
                <View ref={reactRef} collapsable={false}>
                  <DockButton icon="smile" active={panel === 'reactions'} onPress={() => openAt(measureReact, 'reactions')} label={t('Reactions')} size={dockSize} />
                </View>
              )}
              {wide && call.isGroup && <DockButton hand active={call.raised} onPress={toggleRaiseHand} label={call.raised ? t('Lower hand') : t('Raise hand')} size={dockSize} />}
              <DockButton icon="message-square" active={panel === 'chat'} onPress={() => toggle('chat')} label={t('Call chat')} badge={panel === 'chat' ? 0 : call.chatUnread} size={dockSize} />
              {wide ? (
                <>
                  {camOn && (
                    <DockButton icon={selfHidden ? 'eye' : 'eye-off'} active={selfHidden} onPress={() => setSelfHidden((h) => !h)} label={selfHidden ? t('Show my video') : t('Hide my video')} size={dockSize} />
                  )}
                  {canPip && <DockButton icon="minimize-2" active={false} onPress={() => (nativePipSupported ? void enterNativePip() : void enterPip(pipStream))} label={t('Picture in picture')} size={dockSize} />}
                  <View ref={qualRef} collapsable={false}>
                    <DockButton icon="sliders" active={panel === 'quality'} onPress={() => openAt(measureQual, 'quality')} label={t('Call quality')} size={dockSize} />
                  </View>
                  {canInvite && <DockButton icon="user-plus" active={panel === 'invite'} onPress={() => toggle('invite')} label={t('Invite to call')} size={dockSize} />}
                  {!!call.room && <DockButton icon={linkCopied ? 'check' : 'link'} active={linkCopied} onPress={() => void copyMeetingLink()} label={t('Copy meeting link')} size={dockSize} />}
                </>
              ) : (
                <DockButton icon="more-horizontal" active={panel === 'more' || call.sharingScreen} onPress={() => toggle('more')} label={t('More options')} size={dockSize} />
              )}
              <Tooltip label={t('Hang up')}>
                <Pressable
                  accessibilityLabel={t('Hang up')}
                  onPress={hangUp}
                  style={({ pressed, hovered }: any) => ({
                    // As tall as the other buttons (it lives in the same panel), a little wider.
                    width: Math.round(dockSize * 1.35),
                    height: dockSize,
                    borderRadius: dockSize / 2,
                    marginStart: 6,
                    // Like Leave group: a tinted surface with a red icon, not a loud red fill.
                    backgroundColor: pressed || hovered ? colors.dangerTintStrong : colors.dangerTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}>
                  <Icon name="phone-off" size={Math.round(dockSize * 0.42)} color={colors.danger} />
                </Pressable>
              </Tooltip>
            </View>
          </View>
          )}
          </View>
        </Animated.View>
      </SafeAreaView>

      {selfViewShown && (
        <SelfView
          stage={stage}
          topReserve={controlsHidden ? insets.top + 16 : insets.top + (wide ? 16 : 108)}
          bottomReserve={padBottomNow + 4}
          speaking={!!call.localSpeaking}
          onPress={() => {}}>
          <VideoView key={`local-cam-${call.mediaVersion}-${single?.stream?.id ?? ''}`} stream={call.localStream} mirror={call.frontCamera} muted overlay />
          <T variant="label" style={{ position: 'absolute', start: 10, bottom: 8 }}>
            {t('You')}
          </T>
          {canFlip && (
            // Its own corner with some breathing room (the name sits at the other one), clear of the rounded edge.
            <View style={{ position: 'absolute', end: 10, bottom: 10 }} pointerEvents="box-none">
              <Tooltip label={t('Switch camera')}>
                <Pressable
                  accessibilityLabel={t('Switch camera')}
                  onPress={flipCamera}
                  hitSlop={6}
                  style={({ pressed, hovered }: any) => ({
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: pressed || hovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}>
                  <Icon name="refresh-ccw" size={16} color="#fff" />
                </Pressable>
              </Tooltip>
            </View>
          )}
          <View style={{ position: 'absolute', end: 8, bottom: 8 }}>
            <LevelMeter stream={call.localStream} speaking={!!call.localSpeaking} silent={call.micMuted} version={call.mediaVersion} height={24} />
          </View>
          {call.raised && (
            <View style={[styles.glass, { position: 'absolute', start: 8, top: 8, paddingHorizontal: 7, paddingVertical: 2, borderColor: colors.amber, backgroundColor: colors.amberTint }]}>
              <HandIcon size={16} color={colors.amberText} />
            </View>
          )}
        </SelfView>
      )}

      {/* New chat messages pop up over the stage while the chat isn't open, then fade away. */}
      <ChatToasts messages={call.chat} hidden={panel === 'chat'} bottom={(controlsHidden ? 12 : dockHeight + 8) + insets.bottom} onOpen={() => setPanel('chat')} />

      {panel === 'chat' && (
        <CallChatPanel
          onClose={() => setPanel(null)}
          pinned={chatDocked}
          // Only a wide screen has room for a pinned column; phones keep the floating panel.
          onTogglePin={wide ? () => setChatPinned((pinned) => !pinned) : undefined}
          dockWidth={CALL_CHAT_DOCK_WIDTH}
        />
      )}
      {panel === 'quality' && <CallQualityPanel onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} anchorX={wide ? qualX : null} stageWidth={stage.width} />}
      {panel === 'invite' && <CallInvitePanel onClose={() => setPanel(null)} />}
      {panel === 'audio' && <AudioDevicePanel onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} anchorX={outX} stageWidth={stage.width} />}
      {panel === 'cameras' && <CameraPanel onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} anchorX={camX} stageWidth={stage.width} />}
      {panel === 'reactions' && (
        <ReactionsPopover
          onPick={(emoji) => {
            sendReaction(emoji);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
          bottom={dockHeight + insets.bottom}
          anchorX={reactX}
          stageWidth={stage.width}
        />
      )}
      {panel === 'mic' && <MicPanel onClose={() => setPanel(null)} bottom={dockHeight + insets.bottom} anchorX={micX} stageWidth={stage.width} />}
      {panel === 'more' && (
        <MoreSheet
          items={moreItems}
          onClose={() => setPanel(null)}
          bottom={dockHeight + insets.bottom}
          onReact={(emoji) => {
            sendReaction(emoji);
            setPanel(null);
          }}
        />
      )}
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
  let draggedAt = 0;
  let origin = { x: 0, y: 0 };
  // A short push or a flick toward a side is enough; it doesn't have to cross the middle of the screen.
  const SWITCH_PX = 40;
  const FLICK = 0.3;
  const snap = (g: { dx: number; dy: number; vx: number; vy: number }) => {
    dragging = false;
    draggedAt = Date.now();
    if (!geo) return;
    const [v, h] = selfCorner.split('') as ['t' | 'b', 'l' | 'r'];
    const nextH = Math.abs(g.dx) > SWITCH_PX || Math.abs(g.vx) > FLICK ? (g.dx + g.vx * 100 < 0 ? 'l' : 'r') : h;
    const nextV = Math.abs(g.dy) > SWITCH_PX || Math.abs(g.vy) > FLICK ? (g.dy + g.vy * 100 < 0 ? 't' : 'b') : v;
    selfCorner = `${nextV}${nextH}` as Corner;
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
    onPanResponderRelease: (_, g) => snap(g),
    onPanResponderTerminate: (_, g) => snap(g),
  });
  return {
    pos,
    responder,
    /** True right after a drag ended: ignore the click that comes with letting go. */
    justDragged: () => Date.now() - draggedAt < 350,
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
      // Top-left sits below the timer / minimize pill and the status tags.
      y: top ? (left ? Math.max(topReserve, insets.top + 108) : topReserve) : Math.max(topReserve, stage.height - bottomReserve - h),
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
          width: w,
          height: h,
          borderColor: speaking ? colors.amber : colors.hairline,
          borderWidth: 2,
          // The native video is a SurfaceView, and on some phones (seen on a Samsung) it stays blank inside
          // a parent that is moved with a transform, which is what dragging introduced. So on phones the
          // preview moves with left/top (a real layout position); the web keeps the transform.
          ...(Platform.OS === 'web' ? { left: 0, top: 0, transform: pos.getTranslateTransform() } : { left: pos.x, top: pos.y }),
        },
        Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none', touchAction: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' } as object) : null,
      ]}>
      <Pressable style={{ flex: 1 }} onPress={() => !drag.justDragged() && onPress()} accessibilityLabel={t('Your video — drag to move')}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** The small round handle on a dock button's corner that opens its menu.
 *  It sits inside the circle: hanging below it pushed into the dock's label row (user report). */
function ChevronBadge({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  return (
    <View style={{ position: 'absolute', end: 0, bottom: 0 }}>
      <Tooltip label={label} side="bottom">
        <Pressable
          accessibilityLabel={label}
          onPress={onPress}
          hitSlop={6}
          style={({ pressed, hovered }: any) => ({
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: colors.canvas,
            backgroundColor: open ? colors.amber : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
            alignItems: 'center',
            justifyContent: 'center',
          })}>
          <Icon name={open ? 'chevron-down' : 'chevron-up'} size={12} color={open ? colors.onAmber : colors.text} />
        </Pressable>
      </Tooltip>
    </View>
  );
}

/** Mic toggle with a small handle that opens the microphone settings. */
function MicButton({ muted, speaking, panelOpen, onToggle, onOpenPanel, size }: { muted: boolean; speaking: boolean; panelOpen: boolean; onToggle: () => void; onOpenPanel: () => void; size?: number }) {
  return (
    <View>
      <DockButton icon={muted ? 'mic-off' : 'mic'} active={!muted} danger={muted} ring={speaking} onPress={onToggle} label={muted ? t('Unmute') : t('Mute')} size={size} />
      <ChevronBadge label={t('Microphone settings')} open={panelOpen} onPress={onOpenPanel} />
    </View>
  );
}

/**
 * Speaker: pressing it mutes/unmutes everyone's audio (like the mic button mutes my microphone);
 * the small handle opens the sound output menu where each person's volume stays adjustable.
 */
function OutputButton({ muted, panelOpen, onToggleMute, onOpenPanel, size }: { muted: boolean; panelOpen: boolean; onToggleMute: () => void; onOpenPanel: () => void; size?: number }) {
  const label = muted ? t('Unmute call audio') : t('Mute call audio');
  return (
    <View>
      <DockButton icon={muted ? 'volume-x' : 'volume-2'} active={!muted} danger={muted} onPress={onToggleMute} label={label} size={size} />
      <ChevronBadge label={t('Sound output settings')} open={panelOpen} onPress={onOpenPanel} />
    </View>
  );
}

/** Camera toggle with a handle that opens the camera list (where the platform can list cameras). */
function CameraButton({
  off,
  panelOpen,
  onToggle,
  onOpenPanel,
  canSwitch,
  size,
}: {
  off: boolean;
  panelOpen: boolean;
  onToggle: () => void;
  onOpenPanel: () => void;
  canSwitch: boolean;
  size?: number;
}) {
  return (
    <View>
      <DockButton icon={off ? 'video-off' : 'video'} active={!off} onPress={onToggle} label={off ? t('Turn camera on') : t('Turn camera off')} size={size} />
      {canSwitch && <ChevronBadge label={t('Camera settings')} open={panelOpen} onPress={onOpenPanel} />}
    </View>
  );
}

/** Where a dock button sits (horizontal centre in window coordinates) so its popover can open above it. */
function useAnchor() {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [x, setX] = useState<number | null>(null);
  // Returned as separate values so render code never reads through a ref-holding object.
  const measure = (then: () => void) => {
    const node = ref.current;
    if (!node?.measureInWindow) return then();
    node.measureInWindow((px, _py, w) => {
      if (Number.isFinite(px) && w > 0) setX(px + w / 2);
      then();
    });
  };
  return [x, ref, measure] as const;
}

/** The reaction emoji, shown only while the smile button is open; picking one closes it. */
function ReactionsPopover({
  onPick,
  onClose,
  bottom,
  anchorX,
  stageWidth,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  bottom: number;
  anchorX: number | null;
  stageWidth: number;
}) {
  return (
    <Popover onClose={onClose} bottom={bottom} anchorX={anchorX} stageWidth={stageWidth} width={Math.min(340, 62 * REACTIONS.length)}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
        {REACTIONS.map((e) => (
          <Tooltip key={e} label={t('React with {emoji}', { emoji: e })}>
            <Pressable
              accessibilityLabel={t('React with {emoji}', { emoji: e })}
              onPress={() => onPick(e)}
              style={({ pressed, hovered }: any) => ({
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: pressed || hovered ? colors.surfaceHighest : 'transparent',
                transform: [{ scale: pressed ? 1.15 : 1 }],
              })}>
              <T style={{ fontSize: 24 }}>{e}</T>
            </Pressable>
          </Tooltip>
        ))}
      </View>
    </Popover>
  );
}

/** Camera list: which webcam the call sends. Switching swaps the track; the call keeps running. */
function CameraPanel({ onClose, bottom, anchorX, stageWidth }: { onClose: () => void; bottom: number; anchorX: number | null; stageWidth: number }) {
  const { call, selectVideoDevice, refreshVideoDevices } = useCalls();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void refreshVideoDevices();
  }, [refreshVideoDevices]);
  const pick = async (deviceId: string) => {
    if (busy) return;
    setBusy(deviceId);
    try {
      await selectVideoDevice(deviceId);
    } finally {
      setBusy(null);
    }
    onClose();
  };
  return (
    <Popover title={t('Camera settings')} onClose={onClose} bottom={bottom} anchorX={anchorX} stageWidth={stageWidth}>
      {call.videoDevices.map((device) => {
        const selected = !call.cameraOff && device.id === call.videoDeviceId;
        return (
          <Tooltip key={device.id} label={device.label} style={{ alignSelf: 'stretch' }}>
            <Pressable
              disabled={busy !== null}
              onPress={() => void pick(device.id)}
              accessibilityLabel={device.label}
              style={({ pressed, hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: selected ? colors.amber : colors.surfaceHighest,
                backgroundColor: selected ? colors.amberTint : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
              })}>
              <Icon name={busy === device.id ? 'loader' : selected ? 'check-circle' : 'circle'} size={17} color={selected ? colors.amberText : colors.textMuted} />
              <T variant="body" style={{ flex: 1 }} numberOfLines={2}>
                {device.label}
              </T>
            </Pressable>
          </Tooltip>
        );
      })}
      {!call.videoDevices.length && <T color={colors.textMuted}>{t('No camera found. Connect one and try again.')}</T>}
      <T variant="bodySm" color={colors.textMuted}>
        {t('Switching cameras keeps the call connected.')}
      </T>
    </Popover>
  );
}

/**
 * Live level of every microphone while the mic panel is open: a short-lived getUserMedia per device
 * feeds the existing LevelMeter analyser. All tracks stop when the panel closes; a device that can't
 * be opened just has no bars.
 */
function useInputDeviceMeters(devices: { id: string }[]) {
  const [meters, setMeters] = useState<Record<string, MediaStream | null>>({});
  const key = devices.map((device) => device.id).join('|');
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    const opened: MediaStream[] = [];
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    void (async () => {
      for (const device of devices) {
        if (cancelled) break;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: device.id === 'default' ? base : { ...base, deviceId: { exact: device.id } },
          });
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            break;
          }
          opened.push(stream);
          setMeters((current) => ({ ...current, [device.id]: stream }));
        } catch {
          if (!cancelled) setMeters((current) => ({ ...current, [device.id]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
      opened.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    };
    // The device id list is the identity of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return meters;
}

/** Checkbox-style setting row, like the noise-cancellation switch. */
function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: value ? colors.amberTint : 'transparent',
        backgroundColor: pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
      })}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: value ? colors.amber : colors.textMuted,
          backgroundColor: value ? colors.amber : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {value && <Icon name="check" size={14} color={colors.onAmber} />}
      </View>
      <View style={{ flex: 1 }}>
        <T variant="labelLg">{label}</T>
        {!!description && (
          <T variant="bodySm" color={colors.textMuted}>
            {description}
          </T>
        )}
      </View>
    </Pressable>
  );
}

/** What to do when the microphone or camera don't work (the failure guidance, in the panels). */
function MediaHelpNote() {
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="help-circle" size={15} color={colors.amberText} />
        <T variant="labelLg">{t('Audio & video setup')}</T>
      </View>
      {[
        t('Allow the microphone and camera in your browser site settings (the lock icon next to the address), then reload.'),
        t('Close other apps that use the microphone or camera and try again.'),
        t('If an extension or browser policy blocks calls, turn it off or use the Flock desktop app.'),
      ].map((line) => (
        <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, marginTop: 7 }} />
          <T variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
            {line}
          </T>
        </View>
      ))}
    </View>
  );
}

/** Microphone popover: noise cancellation, live input levels and the input device. */
function MicPanel({ onClose, bottom, anchorX, stageWidth }: { onClose: () => void; bottom: number; anchorX?: number | null; stageWidth?: number }) {
  const { call, setNoiseMode, refreshAudioDevices, selectAudioInput } = useCalls();
  useEffect(() => {
    void refreshAudioDevices();
  }, [refreshAudioDevices]);
  const inputs = call.audioDevices.filter((device) => device.kind === 'input');
  const meters = useInputDeviceMeters(inputs);
  const on = call.noiseMode !== 'off';
  const strong = strongNoiseSupported();
  const toggleNoise = (next: boolean) => {
    if (!next) return setNoiseMode('off');
    const preferred = getNoisePreference();
    setNoiseMode(preferred !== 'off' ? preferred : strong ? 'strong' : 'standard');
  };
  return (
    <Popover title={t('Microphone')} onClose={onClose} bottom={bottom} anchorX={anchorX} stageWidth={stageWidth}>
      <Tooltip label={t('Noise cancellation')} style={{ alignSelf: 'stretch' }}>
        <ToggleRow label={t('Noise cancellation')} description={t('Filters out keyboard, fan and background noise.')} value={on} onChange={(next) => void toggleNoise(next)} />
      </Tooltip>
      {on && strong && (
        <ChoiceRow
          values={['standard', 'strong'] as const}
          value={call.noiseMode === 'strong' ? 'strong' : 'standard'}
          label={t('Strength')}
          display={(v) => (v === 'strong' ? t('Strong (AI)') : t('Standard'))}
          onChange={(v) => setNoiseMode(v)}
        />
      )}
      {inputs.length > 0 && <DeviceSection title={t('Microphone input')} icon="mic" devices={inputs} selected={call.audioInputId} onSelect={selectAudioInput} meters={meters} />}
      <MediaHelpNote />
    </Popover>
  );
}

type MenuItem = { icon?: IconName; hand?: boolean; label: string; active?: boolean; badge?: number; onPress: () => void; /** Spans both columns. */ full?: boolean };

/** One column of the phone dock: a round control with its name underneath.
 *  Every column is the same width and the name stays inside it, so the six buttons line up. */
function DockTile({ label, on, danger, children }: { label: string; on?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7 }}>
      {/* Its own centred box: a tooltip wrapper (web) aligns to the start, which pushed Chat and More
          off their labels (user report). */}
      <View>{children}</View>
      <T
        variant="labelSm"
        color={danger ? colors.danger : on ? colors.amberText : colors.textMuted}
        numberOfLines={1}
        style={{ alignSelf: 'stretch', textAlign: 'center' }}>
        {label}
      </T>
    </View>
  );
}

/** A labelled pill on the phone dock's second row (raise hand, share screen, flip). */
function DockPill({ icon, hand, label, active, onPress }: { icon?: IconName; hand?: boolean; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        height: 38,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.amberGlow : pressed ? colors.surfaceHighest : colors.surfaceHigh,
      })}>
      {hand ? <HandIcon size={16} color={active ? colors.amberText : colors.text} /> : <Icon name={icon as IconName} size={16} color={active ? colors.amberText : colors.text} />}
      <T variant="label" color={active ? colors.amberText : colors.text} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** Phone overflow sheet (Stitch): quick reactions on top, then the other controls as two-column tiles. */
function MoreSheet({ items, onClose, bottom, onReact }: { items: MenuItem[]; onClose: () => void; bottom: number; onReact: (emoji: string) => void }) {
  return (
    <Popover onClose={onClose} bottom={bottom}>
      <View style={{ gap: 12 }}>
        <T variant="overline" color={colors.textMuted} style={{ textTransform: 'uppercase', paddingHorizontal: 2 }}>
          {t('Quick reaction')}
        </T>
        <View style={{ flexDirection: 'row', gap: 6, padding: 6, borderRadius: radius.lg, backgroundColor: colors.canvas }}>
          {REACTIONS.map((e) => (
            <Pressable
              key={e}
              accessibilityLabel={t('React with {emoji}', { emoji: e })}
              onPress={() => onReact(e)}
              style={({ pressed, hovered }: any) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: 9,
                borderRadius: radius.md + 2,
                backgroundColor: pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
                transform: [{ scale: pressed ? 1.12 : 1 }],
              })}>
              <T style={{ fontSize: 22, lineHeight: 28 }}>{e}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityLabel={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed, hovered }: any) => ({
                width: item.full ? '100%' : '48.5%',
                flexGrow: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 60,
                paddingHorizontal: 12,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: item.active ? colors.amber : colors.border,
                backgroundColor: item.active ? colors.amberTint : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
              })}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: item.active ? colors.amberGlow : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {item.hand ? <HandIcon size={17} color={item.active ? colors.amberText : colors.text} /> : <Icon name={item.icon as IconName} size={17} color={item.active ? colors.amberText : colors.text} />}
              </View>
              <T variant="label" color={item.active ? colors.amberText : colors.text} numberOfLines={2} style={{ flex: 1 }}>
                {item.label}
              </T>
              {!!item.badge && <UnreadBadge count={item.badge} />}
            </Pressable>
          ))}
        </View>
      </View>
    </Popover>
  );
}

/** A panel that opens just above the dock; with anchorX it is centred on that x (the owning button). */
function Popover({
  title,
  onClose,
  bottom,
  anchorX,
  stageWidth,
  width = 360,
  children,
}: {
  title?: string;
  onClose: () => void;
  bottom: number;
  anchorX?: number | null;
  stageWidth?: number;
  width?: number;
  children: ReactNode;
}) {
  let placement: object | null = null;
  if (anchorX != null && stageWidth) {
    const w = Math.min(width, stageWidth * 0.94);
    placement = { width: w, alignSelf: 'auto', left: Math.min(Math.max(anchorX - w / 2, 8), Math.max(8, stageWidth - w - 8)) };
  }
  return (
    <View
      style={[
        styles.popover,
        { bottom: bottom + 4 },
        placement,
        Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(0,0,0,0.5)' } as object) : null,
      ]}>
      {!!title && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingStart: 4 }}>
          <T variant="headlineSm" style={{ flex: 1 }}>
            {title}
          </T>
          <Tooltip label={t('Close')}>
            <Pressable
              onPress={onClose}
              accessibilityLabel={t('Close')}
              style={({ pressed, hovered }: any) => ({ padding: 6, borderRadius: 12, backgroundColor: pressed || hovered ? colors.surfaceHigh : 'transparent' })}>
              <Icon name="x" />
            </Pressable>
          </Tooltip>
        </View>
      )}
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingEnd: 12 }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Someone on the call screen: me or a remote participant (or a placeholder while waiting). */
type Person = {
  id: string;
  user: User | null;
  self?: boolean;
  stream: MediaStream | null;
  /** Show their camera (not a shared screen) in the tile. */
  video: boolean;
  mirror?: boolean;
  speaking?: boolean;
  /** Their microphone audio, for the level meter. */
  audio?: MediaStream | null;
  net?: NetQuality;
  /** They're sharing their screen (it can be opened on the stage). */
  screen?: boolean;
  muted?: boolean;
  /** Hand raised in a group call. */
  raised?: boolean;
  connecting?: boolean;
  /** No one here yet: show this text instead of a person. */
  placeholder?: string;
};

/** One person's tile: camera video, or their photo on a plain card; the name sits in a corner. */
function Tile({ p, width, height, version, compact, onOpenScreen, onFlip }: { p: Person; width: number; height: number; version: number; compact?: boolean; onOpenScreen?: () => void; /** My own tile: switch front/back camera. */ onFlip?: () => void }) {
  const avatar = Math.round(Math.max(36, Math.min(120, Math.min(width, height) * 0.32)));
  const name = p.self ? t('You') : (p.user?.displayName ?? '…');
  return (
    <Pressable
      disabled={!p.screen || !onOpenScreen}
      onPress={onOpenScreen}
      accessibilityLabel={p.screen && onOpenScreen ? t('Focus shared screen') : name}
      style={{
        width,
        height,
        borderRadius: compact ? radius.md : radius.lg,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: p.speaking ? colors.amber : 'transparent',
      }}>
      {p.placeholder ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 }}>
          <Icon name="users" size={compact ? 18 : 26} color={colors.textMuted} />
          <T variant={compact ? 'bodySm' : 'body'} color={colors.textMuted} style={{ textAlign: 'center' }}>
            {p.placeholder}
          </T>
        </View>
      ) : p.video && p.stream ? (
        <VideoView key={`tile-${p.id}-${version}`} stream={p.stream} mirror={p.mirror} muted={p.self} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar user={p.user} size={avatar} showPresence={false} />
        </View>
      )}
      {p.screen && onOpenScreen && !compact && (
        <View style={[styles.tag, { position: 'absolute', top: 10, end: 10, backgroundColor: colors.amberTint }]}>
          <Icon name="maximize-2" size={13} color={colors.amberText} />
          <T variant="label" color={colors.amberText}>
            {t('Open screen')}
          </T>
        </View>
      )}
      {/* A raised hand shows on the tile so everyone can see who wants to speak. */}
      {p.raised && (
        <View
          accessibilityLabel={t('Hand raised')}
          style={[
            styles.glass,
            {
              position: 'absolute',
              top: compact ? 6 : 10,
              start: compact ? 6 : 10,
              paddingHorizontal: compact ? 5 : 8,
              paddingVertical: compact ? 1 : 3,
              borderColor: colors.amber,
              backgroundColor: colors.amberTint,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            },
          ]}>
          <HandIcon size={compact ? 13 : 16} color={colors.amberText} />
          {!compact && (
            <T variant="label" color={colors.amberText}>
              {t('Hand raised')}
            </T>
          )}
        </View>
      )}
      {/* Flip front/back camera: the corner below the muted badge, across from my name. */}
      {!!onFlip && p.video && (
        <Pressable
          onPress={onFlip}
          accessibilityRole="button"
          accessibilityLabel={t('Switch camera')}
          hitSlop={6}
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: 10,
            end: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
          })}>
          <Icon name="refresh-ccw" size={17} color="#fff" />
        </Pressable>
      )}
      {/* A prominent muted badge: the name chip at the bottom is easy to miss on a busy stage. */}
      {!p.placeholder && p.muted && !p.screen && (
        <View
          accessibilityLabel={t('Muted')}
          style={[
            styles.glass,
            {
              position: 'absolute',
              top: compact ? 6 : 10,
              end: compact ? 6 : 10,
              width: compact ? 22 : 26,
              height: compact ? 22 : 26,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: colors.danger,
            },
          ]}>
          <Icon name="mic-off" size={compact ? 12 : 14} color={colors.danger} />
        </View>
      )}
      {!p.placeholder && (
        <View style={{ position: 'absolute', end: compact ? 6 : 10, bottom: compact ? 6 : 10 }}>
          <LevelMeter stream={p.audio} speaking={p.speaking} silent={p.muted} version={version} height={compact ? 20 : 30} />
        </View>
      )}
      {!p.placeholder && (
        <View
          style={[
            styles.glass,
            {
              position: 'absolute',
              start: compact ? 6 : 10,
              bottom: compact ? 6 : 10,
              maxWidth: width - (compact ? 12 : 20),
              paddingHorizontal: compact ? 7 : 10,
              paddingVertical: compact ? 2 : 4,
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
            },
          ]}>
          {p.connecting && <Icon name="loader" size={12} color={colors.textMuted} />}
          {p.muted && <Icon name="mic-off" size={12} color={colors.danger} />}
          {p.screen && <Icon name="monitor" size={12} color={colors.amberText} />}
          <T variant={compact ? 'labelSm' : 'label'} numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </T>
          <NetBadge q={p.net} size={compact ? 16 : 18} label={netBadgeLabel(p.net, p.self ? 'you' : p.user?.displayName)} />
        </View>
      )}
    </Pressable>
  );
}

/** Tile size that fills the area best for n tiles (about 16:9 each). */
function tileLayout(n: number, width: number, height: number, gap: number) {
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = (height - gap * (rows - 1)) / rows;
    // Keep tiles between portrait-ish and wide; a lone tile may fill the space.
    const w = Math.max(0, Math.min(cellW, cellH * 1.9));
    const h = Math.max(0, Math.min(cellH, w * 1.1));
    if (w * h > best.w * best.h) best = { cols, w, h };
  }
  return best;
}

/** Everyone as tiles, me first (Google Meet style). */
function TileGrid({ people, version, padStyle, onOpenScreen, onFlip }: { people: Person[]; version: number; padStyle: object; onOpenScreen: (id: string) => void; onFlip?: () => void }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const gap = 10;
  const { w, h } = tileLayout(people.length, area.width, area.height, gap);
  return (
    <Animated.View style={[{ flex: 1, paddingHorizontal: 10 }, padStyle]}>
      <View
        style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap }}
        onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {area.width > 0 &&
          people.map((p) => <Tile key={p.id} p={p} width={w} height={h} version={version} onOpenScreen={p.screen ? () => onOpenScreen(p.id) : undefined} onFlip={p.self ? onFlip : undefined} />)}
      </View>
    </Animated.View>
  );
}

/** A shared screen in the middle; everyone (me first) in a strip beside it, or below it on phones.
 *  "Full width" drops the strip and lets the stream use the whole stage. */
function ScreenStage({
  stream,
  ownerName,
  ownerSpeaking,
  people,
  version,
  padStyle,
  fullWidth,
}: {
  stream: MediaStream | null | undefined;
  ownerName: string;
  ownerSpeaking: boolean;
  people: Person[];
  version: number;
  padStyle: object;
  fullWidth: boolean;
}) {
  const wide = useIsWide();
  // Back from another tab: the browser can leave the shared screen in its floating window, and the
  // inline video stays blank until the screen is closed and opened again. Remount it on return.
  const [returnedAt, setReturnedAt] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      exitPip();
      setReturnedAt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const stripTile = wide ? { width: 200, height: 118 } : { width: 124, height: 88 };
  const strip = fullWidth ? null : (
    <ScrollView
      horizontal={!wide}
      style={wide ? { width: stripTile.width, flexGrow: 0, flexShrink: 0 } : { height: stripTile.height, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 8 }}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}>
      {people.map((p) => (
        <Tile key={p.id} p={{ ...p, screen: false }} width={stripTile.width} height={stripTile.height} version={version} compact />
      ))}
    </ScrollView>
  );
  return (
    <Animated.View style={[{ flex: 1, minHeight: 0, flexDirection: wide && !fullWidth ? 'row' : 'column', paddingHorizontal: fullWidth ? 0 : 10, gap: fullWidth ? 0 : 10 }, padStyle]}>
      <View style={{ flex: 1, minWidth: 0, minHeight: 0, borderRadius: fullWidth ? 0 : radius.lg, overflow: 'hidden', backgroundColor: '#05070A', borderWidth: fullWidth ? 0 : 2, borderColor: ownerSpeaking ? colors.amber : colors.hairline }}>
        {!!stream && <VideoView key={`focused-screen-${ownerName}-${version}-${returnedAt}`} stream={stream} contain />}
        <View style={[styles.glass, { position: 'absolute', start: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '70%' }]}>
          <T variant="label" numberOfLines={1}>
            {t('{name} is sharing', { name: ownerName })}
          </T>
        </View>
      </View>
      {strip}
    </Animated.View>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View style={[styles.sidePanel, Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(0,0,0,0.5)' } as object) : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T variant="headlineSm" style={{ flex: 1 }}>{title}</T>
        <Tooltip label={t('Close')}>
          <Pressable
            onPress={onClose}
            accessibilityLabel={t('Close')}
            style={({ pressed, hovered }: any) => ({ padding: 8, borderRadius: 12, backgroundColor: pressed || hovered ? colors.surfaceHigh : 'transparent' })}>
            <Icon name="x" />
          </Pressable>
        </Tooltip>
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
            style={({ pressed, hovered }: any) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: item === value ? colors.amber : colors.surfaceHighest, backgroundColor: item === value ? colors.amberTint : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh })}>
            <T variant="label" color={item === value ? colors.amberText : colors.text}>{display?.(item) ?? String(item)}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CallQualityPanel({ onClose, bottom, anchorX, stageWidth }: { onClose: () => void; bottom: number; anchorX?: number | null; stageWidth?: number }) {
  const { call, setVoiceBitrate, setStreamQuality, setStreamFps } = useCalls();
  const sound = useCallSoundSettings();
  const qualities: readonly StreamQuality[] = ['2k', '1080p', '720p', '480p'];
  const rates: readonly VoiceBitrate[] = [160, 320];
  const fps: readonly StreamFps[] = [60, 30, 15];
  return (
    <Popover title={t('Call quality')} onClose={onClose} bottom={bottom} anchorX={anchorX} stageWidth={stageWidth}>
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
      <View style={{ gap: 8 }}>
        <T variant="labelLg">{t('Call sounds')}</T>
        <Tooltip label={t('Reaction sounds')} style={{ alignSelf: 'stretch' }}>
          <ToggleRow
            label={t('Reaction sounds')}
            description={t('A short tone when you send or receive a reaction.')}
            value={sound.reactionSounds}
            onChange={(next) => setReactionSounds(next)}
          />
        </Tooltip>
        <Tooltip label={t('Call chat sounds')} style={{ alignSelf: 'stretch' }}>
          <ToggleRow
            label={t('Call chat sounds')}
            description={t('A notification when a message arrives in the call chat.')}
            value={sound.chatSounds}
            onChange={(next) => setCallChatSounds(next)}
          />
        </Tooltip>
      </View>
    </Popover>
  );
}

function DeviceSection({
  title,
  icon,
  devices,
  selected,
  onSelect,
  meters,
}: {
  title: string;
  icon: IconName;
  devices: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => Promise<void>;
  /** Live input streams, so every microphone row shows its own level while this panel is open. */
  meters?: Record<string, MediaStream | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={colors.amberText} />
        <T variant="labelLg">{title}</T>
      </View>
      {devices.map((device) => {
        const meter = meters?.[device.id];
        return (
          <Tooltip key={device.id} label={device.label} style={{ alignSelf: 'stretch' }}>
            <Pressable
              disabled={busy !== null}
              onPress={async () => {
                setBusy(device.id);
                try { await onSelect(device.id); } finally { setBusy(null); }
              }}
              accessibilityLabel={device.label}
              style={({ pressed, hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: selected === device.id ? colors.amber : colors.surfaceHighest,
                backgroundColor: selected === device.id ? colors.amberTint : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
              })}>
              <Icon name={busy === device.id ? 'loader' : selected === device.id ? 'check-circle' : 'circle'} size={17} color={selected === device.id ? colors.amberText : colors.textMuted} />
              <T variant="body" style={{ flex: 1 }} numberOfLines={2}>{device.label}</T>
              {/* Live level bar per input, like the browser's own device picker. */}
              {!!meter && <LevelMeter stream={meter} height={22} width={3} />}
            </Pressable>
          </Tooltip>
        );
      })}
    </View>
  );
}

/** Sound output popover: mute-all, per-person volume, output device and a test sound. */
function AudioDevicePanel({ onClose, bottom, anchorX, stageWidth }: { onClose: () => void; bottom: number; anchorX: number | null; stageWidth: number }) {
  const { call, refreshAudioDevices, selectAudioOutput, setParticipantVolume, toggleSpeakerMute } = useCalls();
  const [tone, setTone] = useState<'idle' | 'playing' | 'failed'>('idle');
  useEffect(() => { void refreshAudioDevices(); }, [refreshAudioDevices]);
  const outputs = call.audioDevices.filter((device) => device.kind === 'output');
  // On a phone browser the outputs are call routes, ticked by the mic route in use.
  const routeId = ROUTE_PREFIX + call.audioInputId;
  const selectedOutput = outputs.some((device) => device.id === routeId) ? routeId : call.audioOutputId;
  const testSound = async () => {
    setTone('playing');
    const ok = await playTestTone(call.audioOutputId);
    setTone(ok ? 'idle' : 'failed');
  };
  return (
    <Popover title={t('Sound output')} onClose={onClose} bottom={bottom} anchorX={anchorX} stageWidth={stageWidth}>
      <Tooltip label={call.speakerMuted ? t('Unmute call audio') : t('Mute call audio')} style={{ alignSelf: 'stretch' }}>
        <ToggleRow
          label={t('Mute all call audio')}
          description={t("Mutes everyone's voice and call sounds on your device. Each person's volume below still applies when you unmute.")}
          value={call.speakerMuted}
          onChange={() => toggleSpeakerMute()}
        />
      </Tooltip>
      {call.remotes.length > 0 && (
        <T variant="labelLg" color={call.speakerMuted ? colors.textMuted : colors.text}>
          {t('Participant volume')}
        </T>
      )}
      {call.remotes.map((remote) => (
        <View key={remote.userId} style={{ gap: 4, opacity: call.speakerMuted ? 0.55 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={(remote.volume ?? 1) === 0 ? 'volume-x' : (remote.volume ?? 1) < 0.5 ? 'volume-1' : 'volume-2'} size={16} color={colors.textMuted} />
            <T variant="label" style={{ flex: 1 }} numberOfLines={1}>{remote.user?.displayName ?? t('Someone')}</T>
            <T variant="label" color={colors.amberText} style={{ fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }}>{num(Math.round((remote.volume ?? 1) * 100))}%</T>
          </View>
          <Slider value={remote.volume ?? 1} label={t('Volume of {name}', { name: remote.user?.displayName ?? t('Someone') })} onChange={(value) => setParticipantVolume(remote.userId, value)} />
        </View>
      ))}
      <DeviceSection title={t('Sound output')} icon="volume-2" devices={outputs} selected={selectedOutput} onSelect={selectAudioOutput} />
      {Platform.OS === 'web' ? (
        <Button title={tone === 'failed' ? t('Could not play the test sound') : t('Test sound')} size="sm" variant="ghost" loading={tone === 'playing'} onPress={() => void testSound()} />
      ) : (
        <T variant="bodySm" color={colors.textMuted}>{t('On phones, Bluetooth and wired communication routes pair their microphone and speaker together.')}</T>
      )}
      {!outputs.length && <T color={colors.textMuted}>{t('No audio devices found')}</T>}
      <MediaHelpNote />
    </Popover>
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

function DockButton({
  icon,
  hand,
  active,
  onPress,
  label,
  badge = 0,
  danger,
  ring,
  size: sizeProp,
}: {
  icon?: IconName;
  /** Monochrome raised-hand glyph instead of a Feather icon. */
  hand?: boolean;
  active: boolean;
  onPress: () => void;
  label: string;
  badge?: number;
  danger?: boolean;
  ring?: boolean;
  size?: number;
}) {
  const wide = useIsWide();
  const size = sizeProp ?? (wide ? 54 : 50);
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed, hovered }: any) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: danger ? colors.dangerTint : active ? colors.amberGlow : pressed || hovered ? colors.surfaceHighest : colors.surfaceHigh,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          // The mic lights up while I'm talking (others see the same on my avatar).
          borderWidth: 2,
          borderColor: ring ? colors.amber : 'transparent',
        })}>
        {hand ? (
          <HandIcon size={Math.round(size * 0.41)} color={danger ? colors.danger : active ? colors.amberText : colors.text} />
        ) : (
          <Icon name={icon as IconName} size={Math.round(size * 0.41)} color={danger ? colors.danger : active ? colors.amberText : colors.text} />
        )}
        {badge > 0 && <UnreadBadge count={badge} style={{ position: 'absolute', top: 2, end: 2 }} />}
      </Pressable>
    </Tooltip>
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
