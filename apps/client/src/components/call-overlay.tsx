import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { timer } from '@/lib/format';
import { canSwitchCamera } from '@/lib/native-media';
import { screenShareSupported } from '@/lib/rtc';
import { useCalls } from '@/state/calls';
import { colors, radius } from '@/theme';
import { Avatar } from './avatar';
import { Icon, T, type IconName } from './ui';
import { VideoView } from './video-view';

const REACTIONS = ['❤️', '👏', '💡', '🔥'];

export function CallOverlay() {
  const { call } = useCalls();
  if (call.phase === 'idle') return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, zIndex: 100 }]}>
      {call.phase === 'active' ? <ActiveCall /> : <RingingCall />}
    </View>
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
              {call.video ? 'FLOCK HD VIDEO' : 'FLOCK VOICE'}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T variant="body" color={colors.amberSoft}>
              Secure session
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
            <Avatar user={call.peer} size={180} ring={colors.teal} ringBg={colors.canvas} />
          </View>
          <T variant="display" style={{ fontSize: 40, textAlign: 'center' }}>
            {call.title || call.peer?.displayName}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="bodyLg" color={colors.amberSoft} style={{ fontSize: 18 }}>
              {incoming ? `Flock ${call.video ? 'Video' : 'Voice'} Calling` : 'Ringing…'}
            </T>
            <Icon name="bar-chart-2" size={18} color={colors.amber} />
          </View>
          {!!call.peer?.title && (
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
                { icon: 'clock' as const, text: 'Call you back?' },
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
                <RoundAction icon="phone-off" label="Decline" bg={colors.dangerDeep} color="#FF8A80" glow={colors.danger} onPress={() => decline()} />
                {call.video && (
                  <View style={{ paddingTop: 10 }}>
                    <RoundAction icon="video-off" label="Audio only" bg={colors.surfaceHigh} size={52} onPress={() => accept(true)} />
                  </View>
                )}
                <RoundAction
                  icon={call.video ? 'video' : 'phone'}
                  label="Accept"
                  bg={colors.online}
                  color="#003824"
                  glow={colors.accept}
                  onPress={() => accept()}
                />
              </>
            ) : (
              <RoundAction icon="phone-off" label="Cancel" bg={colors.dangerDeep} color="#FF8A80" glow={colors.danger} onPress={hangUp} />
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

/** Stitch "Active Video Call": full-bleed remote, PiP self view, glass control dock. */
function ActiveCall() {
  const { call, hangUp, toggleMic, toggleCamera, toggleScreenShare, toggleSpeaker, flipCamera, sendReaction } = useCalls();
  const elapsed = useElapsed(call.answeredAt);
  const remoteHasVideo = !!call.remoteStream?.getVideoTracks().length && call.video;
  const localHasVideo = !!call.localStream?.getVideoTracks().length && !call.cameraOff;

  const [floatAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!call.reaction) return;
    floatAnim.setValue(0);
    Animated.timing(floatAnim, { toValue: 1, duration: 1600, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [call.reaction, floatAnim]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Remote stage */}
      <View style={StyleSheet.absoluteFill}>
        {remoteHasVideo ? (
          <VideoView stream={call.remoteStream} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <LinearGradient colors={['rgba(255,184,77,0.08)', 'rgba(11,14,20,0)']} style={StyleSheet.absoluteFill} />
            <Avatar user={call.peer} size={160} ring={colors.amber} />
            <T variant="headline">{call.title || call.peer?.displayName}</T>
            <T variant="body" color={colors.textMuted}>
              {call.remoteStream ? 'Voice call' : 'Connecting…'}
            </T>
          </View>
        )}
        {/* Hidden audio sink for voice-only calls */}
        {!remoteHasVideo && call.remoteStream && Platform.OS === 'web' && (
          <View style={{ width: 0, height: 0, overflow: 'hidden' }}>
            <VideoView stream={call.remoteStream} />
          </View>
        )}
      </View>

      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} pointerEvents="box-none">
        {/* Top status */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }} pointerEvents="box-none">
          <View style={{ gap: 8 }}>
            <View style={[styles.glass, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber }} />
              <T variant="labelLg" style={{ fontSize: 16, fontVariant: ['tabular-nums'] }}>
                {timer(elapsed)}
              </T>
              <T variant="labelLg" color={colors.textMuted}>
                •
              </T>
              <T variant="labelLg" style={{ fontSize: 16 }}>
                {call.title || call.peer?.displayName}
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={[styles.tag, { backgroundColor: colors.tealTint }]}>
                <Icon name="wifi" size={13} color={colors.teal} />
                <T variant="label" color={colors.teal}>
                  {call.video ? 'HD Video' : 'Voice'}
                </T>
              </View>
              <View style={[styles.tag, { backgroundColor: colors.amberTint }]}>
                <Icon name="activity" size={13} color={colors.amber} />
                <T variant="label" color={colors.amber}>
                  Synced
                </T>
              </View>
            </View>
          </View>

          {call.video && (
            <View style={styles.pip}>
              {localHasVideo ? (
                <VideoView stream={call.localStream} mirror={call.frontCamera} muted overlay />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                  <Icon name="video-off" size={22} color={colors.textMuted} />
                </View>
              )}
              <T variant="label" style={{ position: 'absolute', left: 10, bottom: 8 }}>
                You
              </T>
            </View>
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
        <View style={{ padding: 16, gap: 12, alignItems: 'center' }}>
          {!!call.notice && (
            <View style={[styles.glass, { paddingHorizontal: 14, paddingVertical: 8 }]}>
              <Notice text={call.notice} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {REACTIONS.map((e) => (
              <Pressable key={e} onPress={() => sendReaction(e)} style={[styles.glass, { paddingHorizontal: 16, paddingVertical: 6 }]}>
                <T style={{ fontSize: 18 }}>{e}</T>
              </Pressable>
            ))}
          </View>
          <View style={[styles.glass, { flexDirection: 'row', gap: 12, padding: 10, borderRadius: radius.pill }]}>
            <DockButton icon={call.micMuted ? 'mic-off' : 'mic'} active={!call.micMuted} onPress={toggleMic} label="Microphone" />
            {call.video && (
              <DockButton icon={call.cameraOff ? 'video-off' : 'video'} active={!call.cameraOff} onPress={toggleCamera} label="Camera" />
            )}
            {call.video && canSwitchCamera && !call.cameraOff && (
              <DockButton icon="refresh-ccw" active={false} onPress={flipCamera} label="Switch camera" />
            )}
            {Platform.OS !== 'web' && (
              <DockButton icon={call.speakerOn ? 'volume-2' : 'volume-1'} active={call.speakerOn} onPress={toggleSpeaker} label="Speaker" />
            )}
            {call.video && screenShareSupported() && (
              <DockButton icon="monitor" active={call.sharingScreen} onPress={toggleScreenShare} label="Share screen" />
            )}
            <Pressable
              accessibilityLabel="Hang up"
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
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function DockButton({ icon, active, onPress, label }: { icon: IconName; active: boolean; onPress: () => void; label: string }) {
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
  pip: {
    width: 120,
    height: 170,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.rail,
  },
});
