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
  // The signed link is kept with the URL it belongs to, so a row reused for another message can
  // never borrow the previous one's audio.
  const [resolved, setResolved] = useState<{ url: string; link: string } | null>(null);
  const link = resolved?.url === url ? resolved.link : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // This message is the one that plays: follow the shared clock, otherwise stay at zero.
  const active = !!now && !!link && now.url === link;
  const playing = active && now.playing;
  const time = active ? now.time : 0;
  const length = active && now.length ? now.length : (duration ?? 0);
  const progress = length ? Math.min(1, time / length) : 0;

  const resolve = async () => {
    if (link) return link;
    setLoading(true);
    try {
      const full = isLocalUrl(url) ? url : `${getApiUrl()}${(await api.fileLink(url)).url}`;
      setResolved({ url, link: full });
      return full;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not download file'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    if (active) {
      toggleVoice();
      return;
    }
    const full = await resolve();
    if (!full) return;
    await playVoice({
      url: full,
      title: title || t('Voice message'),
      subtitle: subtitle ?? '',
      length: duration,
      conversationId,
      messageId,
    });
  };

  const seek = async (fraction: number) => {
    if (active) {
      seekVoice(fraction);
      return;
    }
    const full = await resolve();
    if (!full) return;
    await playVoice({
      url: full,
      title: title || t('Voice message'),
      subtitle: subtitle ?? '',
      length: duration,
      conversationId,
      messageId,
    });
    // Playback starts at the beginning; jump to where the waveform was tapped.
    setTimeout(() => seekVoice(fraction), 120);
  };

  const shape = clockOf(time);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, minWidth: compact ? 0 : 250, ...(compact ? { flex: 1, alignSelf: 'stretch' } : null) }}>
      <Pressable
        onPress={() => void toggle()}
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
          onSeek={(f) => void seek(f)}
        />
        <T variant="bodySm" color={error ? colors.danger : mine ? '#72521B' : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {error || (link && (playing || time > 0) ? shape : length ? clockOf(length) : t('Voice message'))}
        </T>
      </View>
    </View>
  );
}
