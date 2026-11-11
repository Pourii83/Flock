import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { T } from './ui';

/**
 * Plays an attachment video in the media viewer (web/Electron). The file endpoint needs the
 * Authorization header, which a <video> can't send, so it plays from a short-lived signed link and
 * streams (seeking works, and nothing is downloaded up front).
 */
export function MediaVideo({ url, fit }: { url: string; fit: (w: number, h: number) => { width: number; height: number } }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .fileLink(url)
      .then(({ url: signed }) => !cancelled && setSrc(`${getApiUrl()}${signed}`))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('Could not download file')));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <T color="#fff">{error}</T>;
  const box = size ? fit(size.width, size.height) : null;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {(!src || !box) && <ActivityIndicator color={colors.amber} size="large" />}
      {src && (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={(e) => setSize({ width: e.currentTarget.videoWidth || 640, height: e.currentTarget.videoHeight || 360 })}
          style={{
            width: box?.width ?? 1,
            height: box?.height ?? 1,
            opacity: box ? 1 : 0,
            position: box ? 'relative' : 'absolute',
            borderRadius: 12,
            backgroundColor: '#000',
            display: 'block',
            outline: 'none',
          }}
        />
      )}
    </View>
  );
}
