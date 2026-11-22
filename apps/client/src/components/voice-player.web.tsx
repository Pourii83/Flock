import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { api, getAuthHeaders } from '@/lib/api';
import { isLocalUrl } from '@/lib/sealed-files';
import { getApiUrl } from '@/lib/config';
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

/**
 * A voice message in the chat (web/desktop): play/pause, a progress bar you can tap to seek, and
 * the time. The file needs the Authorization header, so it plays from a short-lived signed link.
 * The sound itself belongs to the shared player (state/voice.ts): it keeps playing while the person
 * moves between chats, and the bar under the chat header controls pause, speed and volume.
 */
export function VoicePlayer({
  url,
  mine,
  waveform,
  duration,
  compact,
  title,
  subtitle,
  conversationId,
  messageId,
}: {
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
}) {
  // Loudness bars: sent with the message, or measured here from the file for older messages.
  const levels = useWaveform(url, waveform, async () =>
    (await fetch(isLocalUrl(url) ? url : `${getApiUrl()}${url}`, isLocalUrl(url) ? undefined : { headers: getAuthHeaders() })).arrayBuffer(),
  );
  const now = useVoice();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // This message is the one that plays: follow the shared clock, otherwise stay at zero. Matched by
  // the file, not its signed link, so a row that was remounted still knows it is playing.
  const active = !!now && now.key === url;
  const playing = active && now.playing;
  const time = active ? now.time : 0;
  const length = active && now.length ? now.length : (duration ?? 0);
  const progress = length ? Math.min(1, time / length) : 0;

  // Signed links expire after a few minutes, so every start and retry asks for its own.
  const signedLink = async () => (isLocalUrl(url) ? url : `${getApiUrl()}${(await api.fileLink(url)).url}`);

  const start = async (from?: number) => {
    if (loading) return;
    setLoading(true);
    setError('');
    let link: string;
    try {
      link = await signedLink();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not download file'));
      return;
    } finally {
      setLoading(false);
    }
    await playVoice({
      url: link,
      key: url,
      renew: signedLink,
      title: title || t('Voice message'),
      subtitle: subtitle ?? '',
      length: duration,
      from,
      conversationId,
      messageId,
    });
  };

  const toggle = () => {
    if (active) toggleVoice();
    else void start();
  };

  const seek = (fraction: number) => {
    if (active) seekVoice(fraction);
    else void start(fraction);
  };

  const shape = clockOf(time);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, minWidth: compact ? 0 : 250, ...(compact ? { flex: 1, alignSelf: 'stretch' } : null) }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={playing ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.14)' : colors.amber }}>
        {loading ? <ActivityIndicator color={colors.onAmber} size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={18} color={colors.onAmber} />}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <WaveBars
          levels={levels}
          progress={progress}
          played={mine ? colors.onAmber : colors.amber}
          rest={mine ? 'rgba(61,38,0,0.32)' : colors.textDim}
          onSeek={seek}
        />
        <T variant="bodySm" color={error ? colors.danger : mine ? '#72521B' : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {error || (playing || time > 0 ? shape : length ? clockOf(length) : t('Voice message'))}
        </T>
      </View>
    </View>
  );
}
