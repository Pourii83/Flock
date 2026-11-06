import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { Icon, T } from './ui';

/**
 * Plays the other side's audio for the whole call through one dedicated <audio> element,
 * independent of the video views (which come and go when camera/screen toggles).
 * If the browser blocks autoplay, shows a button to start playback.
 */
export function RemoteAudio({ stream, version, outputDeviceId = 'default', volume = 1 }: { stream: MediaStream | null; version: number; outputDeviceId?: string; volume?: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const trackIds = useRef('');
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tracks = stream?.getAudioTracks() ?? [];
    const ids = tracks.map((tr) => tr.id).join(',');
    // Only re-attach when the set of audio tracks really changed, so playback never restarts needlessly.
    if (ids !== trackIds.current) {
      trackIds.current = ids;
      el.srcObject = tracks.length ? new MediaStream(tracks) : null;
    }
    if (tracks.length && el.paused) el.play().then(() => setBlocked(false), () => setBlocked(true));
  }, [stream, version]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    // '' is the system default in every browser ('default' is a Chrome-only id).
    if (el?.setSinkId) el.setSinkId(outputDeviceId === 'default' ? '' : outputDeviceId).catch(() => {});
  }, [outputDeviceId]);

  return (
    <>
      <audio ref={ref} autoPlay />
      {blocked && (
        <Pressable
          onPress={() => ref.current?.play().then(() => setBlocked(false), () => setBlocked(true))}
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: '42%',
            zIndex: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 22,
            paddingVertical: 14,
            borderRadius: radius.pill,
            backgroundColor: colors.amber,
          }}>
          <Icon name="volume-2" size={20} color={colors.onAmber} />
          <T variant="labelLg" color={colors.onAmber}>
            {t('Tap to play sound')}
          </T>
        </Pressable>
      )}
    </>
  );
}
