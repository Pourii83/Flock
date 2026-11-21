// The voice message that is playing, as one bar under the chat header (and above the chat list on
// phones): name, a seekable progress line, play/pause, skip, volume and playback speed, and close.
// Playback itself lives in state/voice.ts, so moving between chats never stops the sound.
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { useIsWide } from '@/hooks/use-layout';
import { t } from '@/lib/i18n';
import { requestJump } from '@/lib/jump';
import {
  VOICE_MAX_SPEED,
  VOICE_MIN_SPEED,
  seekVoice,
  setVoiceMuted,
  setVoiceSpeed,
  setVoiceVolume,
  skipVoice,
  stopVoice,
  toggleVoice,
  useVoice,
} from '@/state/voice';
import { colors, radius } from '@/theme';
import { Slider } from './slider';
import { IconButton, T } from './ui';

/** One tap steps through these, like Telegram (back to 1× after the last). */
const SPEEDS = [1, 1.5, 2];
const nextSpeed = (speed: number) => SPEEDS.find((s) => s > speed + 0.01) ?? SPEEDS[0]!;

/** The named steps, as in Telegram's speed menu; the slider above them covers everything else. */
const STEPS = [
  { speed: 0.5, label: 'Slow' },
  { speed: 1, label: 'Normal' },
  { speed: 1.2, label: 'Medium' },
  { speed: 1.5, label: 'Fast' },
  { speed: 1.7, label: 'Very fast' },
  { speed: 2, label: 'Super fast' },
] as const;

const web = Platform.OS === 'web';

/** Height of the vertical volume slider. */
const VOLUME_H = 96;

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A small card under its button. On the web it hangs off the bar (hover opens it); on a phone a
 * long press raises it over the chat with a scrim, since a phone has no hover.
 */
function Panel({ children, onClose, width = 236 }: { children: ReactNode; onClose: () => void; width?: number }) {
  if (!web) {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={onClose}>
        <Pressable
          style={{ flex: 1, backgroundColor: colors.scrim }}
          onPress={onClose}
          accessibilityLabel={t('Close')}
        />
        <View
          style={{
            position: 'absolute',
            start: 12,
            end: 12,
            top: 96,
            padding: 12,
            gap: 10,
            backgroundColor: colors.panel,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
            ...(shadow as object),
          }}>
          {children}
        </View>
      </Modal>
    );
  }
  return (
    <View
      style={{
        position: 'absolute',
        // Touching the button: the pointer can move straight down into the card, so the hover
        // (which closes it) never crosses a gap.
        top: '100%',
        end: 0,
        width,
        padding: 10,
        gap: 8,
        zIndex: 60,
        backgroundColor: colors.panel,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.surfaceHigh,
        ...(shadow as object),
      }}>
      {children}
    </View>
  );
}

/** The speaker control's slider: drag up for louder, tap anywhere on the track to jump there. */
function VolumeSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const v = Math.max(0, Math.min(1, value));
  const set = (y: number) => onChange(Math.max(0, Math.min(1, 1 - y / VOLUME_H)));
  const thumb = dragging ? 14 : 12;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t('Volume')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(1, v + 0.05));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(0, v - 0.05));
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        setDragging(true);
        set(e.nativeEvent.locationY);
      }}
      onResponderMove={(e) => set(e.nativeEvent.locationY)}
      onResponderRelease={() => setDragging(false)}
      onResponderTerminate={() => setDragging(false)}
      style={{ width: 24, height: VOLUME_H, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          width: 6,
          height: '100%',
          borderRadius: 3,
          backgroundColor: colors.surfaceHighest,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        }}>
        <View style={{ width: '100%', height: `${Math.round(v * 100)}%`, backgroundColor: colors.amber }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: Math.round((1 - v) * VOLUME_H) - thumb / 2,
          width: thumb,
          height: thumb,
          borderRadius: thumb / 2,
          backgroundColor: colors.amber,
        }}
      />
    </View>
  );
}

export function VoiceBar() {
  const now = useVoice();
  const wide = useIsWide();
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ c?: string; id?: string }>();
  const [panel, setPanel] = useState<'speed' | 'volume' | null>(null);
  const [seekWidth, setSeekWidth] = useState(0);
  if (!now) return null;

  const progress = now.length ? Math.min(1, now.time / now.length) : 0;
  const fast = Math.abs(now.speed - 1) > 0.01;
  const silent = now.muted || now.volume === 0;
  const canJump = !!now.conversationId && !!now.messageId;

  /** The bar's own progress line: press or drag anywhere on it to move through the message. */
  const seekTo = (x: number) => {
    if (now.length && seekWidth > 0) seekVoice(Math.max(0, Math.min(1, x / seekWidth)));
  };

  /** Opens the chat the voice belongs to, scrolled to that message (the bar travels across chats). */
  const showMessage = () => {
    if (!now.conversationId || !now.messageId) return;
    const { conversationId, messageId } = now;
    requestJump(conversationId, messageId);
    const here = wide
      ? pathname === '/' && params.c === conversationId
      : pathname === `/chat/${conversationId}`;
    if (here) return;
    if (wide) router.navigate({ pathname: '/', params: { c: conversationId } });
    else router.push(`/chat/${conversationId}` as never);
  };

  // Turning the sound back on from zero also has to raise the volume, or the button would look on
  // while nothing is heard.
  const toggleMute = () => {
    if (now.volume === 0) {
      setVoiceVolume(1);
      setVoiceMuted(false);
      return;
    }
    setVoiceMuted(!now.muted);
  };

  const closePanel = () => setPanel(null);
  const hover = (name: 'speed' | 'volume') =>
    web
      ? ({
          onMouseEnter: () => setPanel(name),
          onMouseLeave: () => setPanel((p) => (p === name ? null : p)),
        } as object)
      : null;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        backgroundColor: colors.rail,
        zIndex: 15,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconButton name="x" label={t('Close')} onPress={stopVoice} size={30} iconSize={15} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Pressable
            onPress={showMessage}
            disabled={!canJump}
            accessibilityRole={canJump ? 'button' : undefined}
            accessibilityLabel={canJump ? t('Show in chat') : undefined}
            style={({ hovered }: any) => ({
              gap: 3,
              marginHorizontal: -4,
              paddingHorizontal: 4,
              borderRadius: radius.sm,
              backgroundColor: hovered && canJump ? colors.hover : 'transparent',
            })}>
            <T variant="labelLg" numberOfLines={1}>
              {now.title}
            </T>
            <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
              {now.subtitle}
            </T>
          </Pressable>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={t('Seek')}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => skipVoice(e.nativeEvent.actionName === 'increment' ? 5 : -5)}
            onLayout={(e) => setSeekWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => now.length > 0}
            onMoveShouldSetResponder={() => now.length > 0}
            onResponderGrant={(e) => seekTo(e.nativeEvent.locationX)}
            onResponderMove={(e) => seekTo(e.nativeEvent.locationX)}
            style={{
              height: 14,
              justifyContent: 'center',
              ...(web ? ({ cursor: 'pointer', touchAction: 'none' } as object) : null),
            }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.surfaceHigh,
                overflow: 'hidden',
              }}>
              <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: colors.amber }} />
            </View>
          </View>
        </View>
        <T variant="bodySm" color={colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {clock(now.time)}
        </T>
        <IconButton name="rotate-ccw" label={t('Back 10 seconds')} onPress={() => skipVoice(-10)} size={30} iconSize={15} />
        <IconButton
          name={now.playing ? 'pause' : 'play'}
          label={now.playing ? t('Pause') : t('Play voice message')}
          onPress={toggleVoice}
          size={34}
          iconSize={17}
          bg={colors.amber}
          activeBg={colors.amberSoft}
          color={colors.onAmber}
        />
        <IconButton name="rotate-cw" label={t('Forward 10 seconds')} onPress={() => skipVoice(10)} size={30} iconSize={15} />
        <View style={{ position: 'relative' }} {...hover('volume')}>
          <IconButton
            name={silent ? 'volume-x' : now.volume < 0.5 ? 'volume-1' : 'volume-2'}
            label={silent ? t('Unmute') : t('Mute')}
            onPress={toggleMute}
            size={30}
            iconSize={15}
          />
          {panel === 'volume' && (
            <Panel onClose={closePanel} width={72}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <T variant="labelSm" color={colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
                  {`${Math.round(now.volume * 100)}%`}
                </T>
                <VolumeSlider value={now.volume} onChange={setVoiceVolume} />
              </View>
            </Panel>
          )}
        </View>
        <View style={{ position: 'relative' }} {...hover('speed')}>
          <Pressable
            onPress={() => setVoiceSpeed(nextSpeed(now.speed))}
            onLongPress={() => setPanel('speed')}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={t('Playback speed')}
            accessibilityValue={{ text: `${Number(now.speed.toFixed(2))}×` }}
            style={({ hovered }: any) => ({
              minWidth: 44,
              alignItems: 'center',
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: fast ? colors.amberTint : hovered ? colors.surfaceHighest : colors.surfaceHigh,
            })}>
            <T variant="label" color={fast ? colors.amberText : colors.text} style={{ fontVariant: ['tabular-nums'] }}>
              {`${Number(now.speed.toFixed(2))}×`}
            </T>
          </Pressable>
          {panel === 'speed' && (
            <Panel onClose={closePanel}>
              <T variant="labelLg" style={{ fontVariant: ['tabular-nums'] }}>
                {`${now.speed.toFixed(1)}×`}
              </T>
              <Slider
                value={(now.speed - VOICE_MIN_SPEED) / (VOICE_MAX_SPEED - VOICE_MIN_SPEED)}
                onChange={(f) => setVoiceSpeed(VOICE_MIN_SPEED + f * (VOICE_MAX_SPEED - VOICE_MIN_SPEED))}
                label={t('Playback speed')}
                step={0.1 / (VOICE_MAX_SPEED - VOICE_MIN_SPEED)}
              />
              <View style={{ gap: 2 }}>
                {STEPS.map(({ speed, label }) => {
                  const on = Math.abs(now.speed - speed) < 0.001;
                  return (
                    <Pressable
                      key={speed}
                      onPress={() => {
                        setVoiceSpeed(speed);
                        closePanel();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${label}, ${speed}×`}
                      style={({ hovered }: any) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 7,
                        borderRadius: radius.md,
                        backgroundColor: on ? colors.amberTint : hovered ? colors.surfaceHigh : 'transparent',
                      })}>
                      <T
                        variant="bodySm"
                        color={on ? colors.amberText : colors.textMuted}
                        style={{ width: 36, fontVariant: ['tabular-nums'] }}>
                        {`${speed.toFixed(1)}×`}
                      </T>
                      <T variant="body" color={on ? colors.amberText : colors.text}>
                        {t(label)}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            </Panel>
          )}
        </View>
      </View>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 18 };
