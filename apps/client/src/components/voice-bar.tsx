// The voice message that is playing, as one bar under the chat header (and above the chat list on
// phones): name, progress, play/pause, skip, mute, a speed button (1× → 1.5× → 2×) and close.
// Playback itself lives in state/voice.ts, so moving between chats never stops the sound.
import { Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { skipVoice, setVoiceMuted, setVoiceSpeed, stopVoice, toggleVoice, useVoice } from '@/state/voice';
import { colors, radius } from '@/theme';
import { IconButton, T } from './ui';

/** One tap steps through these, like Telegram (back to 1× after the last). */
const SPEEDS = [1, 1.5, 2];
const nextSpeed = (speed: number) => SPEEDS.find((s) => s > speed + 0.01) ?? SPEEDS[0]!;

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function VoiceBar() {
  const now = useVoice();
  if (!now) return null;
  const progress = now.length ? Math.min(1, now.time / now.length) : 0;
  const fast = Math.abs(now.speed - 1) > 0.01;

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
          <T variant="labelLg" numberOfLines={1}>
            {now.title}
          </T>
          <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
            {now.subtitle}
          </T>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.surfaceHigh, overflow: 'hidden', marginTop: 2 }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: colors.amber }} />
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
        <IconButton
          name={now.muted ? 'volume-x' : 'volume-2'}
          label={now.muted ? t('Unmute') : t('Mute')}
          onPress={() => setVoiceMuted(!now.muted)}
          size={30}
          iconSize={15}
        />
        <Pressable
          onPress={() => setVoiceSpeed(nextSpeed(now.speed))}
          accessibilityRole="button"
          accessibilityLabel={t('Playback speed')}
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
      </View>
    </View>
  );
}
