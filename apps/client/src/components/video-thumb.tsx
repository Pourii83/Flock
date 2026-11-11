import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { attachmentSource } from '@/lib/attachments';

/** A still frame of a chat video (Android/iOS). Renders nothing until the frame is ready or if it fails. */
export function VideoThumb({ url }: { url: string; size?: number }) {
  const player = useVideoPlayer(attachmentSource(url));
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);

  useEffect(() => {
    if (status !== 'readyToPlay' || thumb) return;
    let cancelled = false;
    player
      .generateThumbnailsAsync(0.1, { maxWidth: 720 })
      .then((frames) => !cancelled && setThumb(frames[0] ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, player, thumb]);

  if (!thumb) return null;
  return <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" />;
}
