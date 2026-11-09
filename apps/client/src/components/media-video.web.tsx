import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { getAuthHeaders } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { T } from './ui';

/**
 * Plays an attachment video in the media viewer (web/Electron).
 * The file endpoint needs the Authorization header, so the video is fetched as a blob first.
 */
export function MediaVideo({ url, fit }: { url: string; fit: (w: number, h: number) => { width: number; height: number } }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`${getApiUrl()}${url}`, { headers: getAuthHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 410 ? t('File expired') : t('Could not download file'));
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t('Could not download file')));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
