import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, View } from 'react-native';

import { attachmentSource } from '@/lib/attachments';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { T } from './ui';

/** Plays an attachment video in the media viewer (Android/iOS); streams straight from the authenticated endpoint. */
export function MediaVideo({ url, fit }: { url: string; fit: (w: number, h: number) => { width: number; height: number } }) {
  const player = useVideoPlayer(attachmentSource(url), (p) => p.play());
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  if (status === 'error') return <T color="#fff">{t('Could not download file')}</T>;
  const size = videoTrack?.size;
  const box = size?.width && size?.height ? fit(size.width, size.height) : fit(16, 9);
  return (
    <View style={{ width: box.width, height: box.height, alignItems: 'center', justifyContent: 'center' }}>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: box.width, height: box.height, backgroundColor: '#000' }} />
      {status === 'loading' && <ActivityIndicator color={colors.amber} size="large" style={{ position: 'absolute' }} />}
    </View>
  );
}
