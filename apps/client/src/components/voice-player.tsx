import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { Pressable, View } from 'react-native';

import { attachmentSource } from '@/lib/attachments';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { Icon, T } from './ui';

export const clockOf = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A voice message in the chat (Android): expo-video's player plays audio-only files too. */
export function VoicePlayer({ url, mine }: { url: string; mine: boolean }) {
  const player = useVideoPlayer(attachmentSource(url), (p) => {
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const length = player.duration || 0;
  const progress = length ? Math.min(1, currentTime / length) : 0;

  const toggle = () => {
    if (isPlaying) player.pause();
    else {
      if (length && currentTime >= length - 0.2) player.replay();
      else player.play();
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={isPlaying ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.14)' : colors.amber }}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={colors.onAmber} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: mine ? 'rgba(61,38,0,0.18)' : colors.surfaceHighest, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: mine ? colors.onAmber : colors.amber }} />
        </View>
        <T variant="bodySm" color={status === 'error' ? colors.danger : mine ? '#72521B' : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {status === 'error' ? t('Could not play this voice message') : isPlaying || currentTime > 0 ? clockOf(currentTime) : length ? clockOf(length) : t('Voice message')}
        </T>
      </View>
    </View>
  );
}
