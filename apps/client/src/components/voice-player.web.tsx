import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { Icon, T } from './ui';

export const clockOf = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A voice message in the chat (web/desktop): play/pause, a progress bar you can tap to seek, and
 * the time. The file needs the Authorization header, so it plays from a short-lived signed link.
 */
export function VoicePlayer({ url, mine }: { url: string; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [error, setError] = useState('');
  const [barWidth, setBarWidth] = useState(1);

  useEffect(() => () => audio.current?.pause(), []);

  const ensure = async () => {
    if (audio.current) return audio.current;
    setLoading(true);
    try {
      const { url: signed } = await api.fileLink(url);
      const full = `${getApiUrl()}${signed}`;
      const el = new Audio(full);
      el.preload = 'auto';
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
      el.onended = () => {
        setPlaying(false);
        setTime(0);
      };
      el.ontimeupdate = () => setTime(el.currentTime);
      // WebM from MediaRecorder reports Infinity until it has been read through once.
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration)) setLength(el.duration);
      };
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration)) setLength(el.duration);
      };
      audio.current = el;
      setSrc(full);
      return el;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not download file'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const el = await ensure();
    if (!el) return;
    if (el.paused) void el.play().catch(() => setError(t('Could not play this voice message')));
    else el.pause();
  };

  const seek = async (x: number) => {
    const el = await ensure();
    if (!el || !length) return;
    el.currentTime = Math.max(0, Math.min(length, (x / barWidth) * length));
    setTime(el.currentTime);
  };

  const progress = length ? Math.min(1, time / length) : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <Pressable
        onPress={() => void toggle()}
        accessibilityLabel={playing ? t('Pause') : t('Play voice message')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(61,38,0,0.14)' : colors.amber }}>
        {loading ? <ActivityIndicator color={mine ? colors.onAmber : colors.onAmber} size="small" /> : <Icon name={playing ? 'pause' : 'play'} size={18} color={colors.onAmber} />}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <Pressable onPress={(e: any) => void seek(e.nativeEvent.locationX ?? 0)} onLayout={(e) => setBarWidth(Math.max(1, e.nativeEvent.layout.width))} style={{ paddingVertical: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: mine ? 'rgba(61,38,0,0.18)' : colors.surfaceHighest, overflow: 'hidden' }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: mine ? colors.onAmber : colors.amber }} />
          </View>
        </Pressable>
        <T variant="bodySm" color={error ? colors.danger : mine ? '#72521B' : colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
          {error || (src && (playing || time > 0) ? clockOf(time) : length ? clockOf(length) : t('Voice message'))}
        </T>
      </View>
    </View>
  );
}
