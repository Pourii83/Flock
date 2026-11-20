// The voice message that is playing, as one bar under the chat header (and above the chat list on
// phones): name, progress, play/pause, skip, mute, a continuous 0.5×–2.5× speed slider and close.
// Playback itself lives in state/voice.ts, so moving between chats never stops the sound.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { skipVoice, setVoiceMuted, setVoiceSpeed, stopVoice, toggleVoice, useVoice, VOICE_MAX_SPEED, VOICE_MIN_SPEED } from '@/state/voice';
import { colors, radius } from '@/theme';
import { Slider } from './slider';
import { IconButton, T } from './ui';

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function VoiceBar() {
  const now = useVoice();
  const [speedOpen, setSpeedOpen] = useState(false);
  if (!now) return null;
  const progress = now.length ? Math.min(1, now.time / now.length) : 0;
  const speedLabel = `${now.speed.toFixed(1)}×`;

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
          onPress={() => setSpeedOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={t('Playback speed')}
          accessibilityState={{ expanded: speedOpen }}
          style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: speedOpen ? colors.amberTint : colors.surfaceHigh }}>
          <T variant="label" color={speedOpen ? colors.amberText : colors.text} style={{ fontVariant: ['tabular-nums'] }}>
            {speedLabel}
          </T>
        </Pressable>
      </View>

      {speedOpen && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 34, paddingBottom: 2 }}>
          <T variant="label" color={colors.textMuted}>
            {`${VOICE_MIN_SPEED}×`}
          </T>
          <View style={{ flex: 1 }}>
            <Slider
              label={t('Playback speed')}
              value={(now.speed - VOICE_MIN_SPEED) / (VOICE_MAX_SPEED - VOICE_MIN_SPEED)}
              step={0.01}
              onChange={(value) => setVoiceSpeed(VOICE_MIN_SPEED + value * (VOICE_MAX_SPEED - VOICE_MIN_SPEED))}
            />
          </View>
          <T variant="label" color={colors.textMuted}>
            {`${VOICE_MAX_SPEED}×`}
          </T>
          <T variant="labelLg" color={colors.amberText} style={{ fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' }}>
            {speedLabel}
          </T>
        </View>
      )}
    </View>
  );
}
