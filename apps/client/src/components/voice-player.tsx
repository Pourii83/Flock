import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { attachmentSource } from '@/lib/attachments';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { useWaveform } from '@/lib/waveform';
import { playVoice, seekVoice, toggleVoice, useVoice } from '@/state/voice';
import { Icon, T } from './ui';
import { WaveBars } from './wave-bars';

export const clockOf = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type VoiceProps = {
  url: string;
  mine: boolean;
  waveform?: string | null;
  duration?: number;
  /** Fits a narrow space (the composer's preview of a fresh recording). */
  compact?: boolean;
  /** Shown in the player bar (defaults to the generic voice-message label). */
  title?: string;
  subtitle?: string;
  /** Where this message is, so the player bar can jump back to it from another chat. */
  conversationId?: string;
  messageId?: string;
};

/**
 * A voice message in the chat (Android): the sound comes from the shared player (state/voice.ts),
 * the same one the bar under the header controls, so playback keeps going across chats.
 */
function SentVoicePlayer({ url, mine, waveform, duration, title, subtitle, conversationId, messageId }: VoiceProps) {
  // The bars come with the message (older voice messages show a flat line here).
  const levels = useWaveform(url, waveform, null);
  const now = useVoice();
  const [loading, setLoading] = useState(false);
  // This message is the one that plays: follow the shared clock, otherwise stay at zero.
  const active = !!now && now.key === url;
  const playing = active && now.playing;
  const time = active ? now.time : 0;
  const length = active && now.length ? now.length : (duration ?? 0);
  const progress = length ? Math.min(1, time / length) : 0;

  const start = async (at?: number) => {
    setLoading(true);
    try {
      await playVoice({
        url,
        title: title || t('Voice message'),
        subtitle: subtitle ?? '',
        length: duration,
        from: at,
        conversationId,
        messageId,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (active) toggleVoice();
    else void start();
  };

  const seek = (fraction: number) => {
    if (active) seekVoice(fraction);
    else void start(fraction);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 250 }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={playing ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? colors.amberSoftFillStrong : colors.amber }}>
        {loading ? <ActivityIndicator color={mine ? colors.onAmberSoft : colors.onAmber} size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={18} color={mine ? colors.onAmberSoft : colors.onAmber} />}
      </Pressable>
      {/* Play, the timeline and the time on one line; only a failure gets a line of its own. */}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <WaveBars
              levels={levels}
              progress={progress}
              played={mine ? colors.onAmberSoft : colors.amber}
              rest={mine ? colors.amberSoftTrack : colors.textDim}
              onSeek={seek}
            />
          </View>
          <T variant="bodySm" color={mine ? colors.amberSoftMuted : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
            {playing || time > 0 ? clockOf(time) : length ? clockOf(length) : t('Voice message')}
          </T>
        </View>
        {!!(active && now.error) && (
          <T variant="bodySm" color={colors.danger} numberOfLines={2}>
            {now.error}
          </T>
        )}
      </View>
    </View>
  );
}

/** The recording still in the composer: its own short player, so it never takes over the chat's. */
function PreviewPlayer({ url, mine, waveform, duration, compact }: VoiceProps) {
  const levels = useWaveform(url, waveform, null);
  const player = useVideoPlayer(attachmentSource(url), (p) => {
    // Often enough that the played part of the waveform glides instead of stepping.
    p.timeUpdateEventInterval = 0.05;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, minWidth: compact ? 0 : 250, ...(compact ? { flex: 1, alignSelf: 'stretch' } : null) }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={isPlaying ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? colors.amberSoftFillStrong : colors.amber }}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={mine ? colors.onAmberSoft : colors.onAmber} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <WaveBars
          levels={levels}
          progress={progress}
          played={mine ? colors.onAmberSoft : colors.amber}
          rest={mine ? colors.amberSoftTrack : colors.textDim}
          onSeek={length ? (f) => player.seekBy(f * length - currentTime) : undefined}
        />
        <T variant="bodySm" color={status === 'error' ? colors.danger : mine ? colors.amberSoftMuted : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {status === 'error' ? t('Could not play this voice message') : isPlaying || currentTime > 0 ? clockOf(currentTime) : length ? clockOf(length) : t('Voice message')}
        </T>
      </View>
    </View>
  );
}

export function VoicePlayer(props: VoiceProps) {
  return props.compact ? <PreviewPlayer {...props} /> : <SentVoicePlayer {...props} />;
}
