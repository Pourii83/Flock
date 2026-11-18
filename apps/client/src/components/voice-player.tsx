import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { Pressable, View } from 'react-native';

import { attachmentSource } from '@/lib/attachments';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { useWaveform } from '@/lib/waveform';
import { Icon, T } from './ui';
import { WaveBars } from './wave-bars';

export const clockOf = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A voice message in the chat (Android): expo-video's player plays audio-only files too. */
export function VoicePlayer({
  url,
  mine,
  waveform,
  duration,
  compact,
}: {
  url: string;
  mine: boolean;
  waveform?: string | null;
  duration?: number;
  /** Fits a narrow space (the composer's preview of a fresh recording). */
  compact?: boolean;
}) {
  // The bars come with the message (older voice messages show a flat line here).
  const levels = useWaveform(url, waveform, null);
  const player = useVideoPlayer(attachmentSource(url), (p) => {
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  // Browser recordings don't carry their length; the message does.
  const length = player.duration || duration || 0;
  const progress = length ? Math.min(1, currentTime / length) : 0;

  const toggle = () => {
    if (isPlaying) player.pause();
    else {
      if (length && currentTime >= length - 0.2) player.replay();
      else player.play();
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, minWidth: compact ? 0 : 250 }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={isPlaying ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.14)' : colors.amber }}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={colors.onAmber} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <WaveBars
          levels={levels}
          progress={progress}
          played={mine ? colors.onAmber : colors.amber}
          rest={mine ? 'rgba(61,38,0,0.32)' : colors.textDim}
          onSeek={length ? (f) => player.seekBy(f * length - currentTime) : undefined}
        />
        <T variant="bodySm" color={status === 'error' ? colors.danger : mine ? '#72521B' : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {status === 'error' ? t('Could not play this voice message') : isPlaying || currentTime > 0 ? clockOf(currentTime) : length ? clockOf(length) : t('Voice message')}
        </T>
      </View>
    </View>
  );
}
