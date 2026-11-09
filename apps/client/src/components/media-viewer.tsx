import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/use-layout';
import { attachmentSource, openAttachment } from '@/lib/attachments';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';
import { MediaVideo } from './media-video';
import { IconButton, T } from './ui';

export type ViewerMedia = { url: string; name: string; mimeType: string };

const BAR = 64;
const BUTTON = { color: '#fff', bg: 'rgba(255,255,255,0.10)', activeBg: 'rgba(255,255,255,0.20)' };

/**
 * Telegram-style viewer for image/video attachments: the media pops into the middle of a dimmed screen.
 * Phones give it all the room the screen has; wide screens keep it at a comfortable size.
 */
export function MediaViewer({ media, onClose }: { media: ViewerMedia | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  // Keyed by url so a stale size from a previous image is never applied to the next one.
  const [loaded, setLoaded] = useState<{ url: string; width: number; height: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<{ url: string; text: string } | null>(null);
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!media) return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [media, pop]);

  useEffect(() => {
    if (!media || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, onClose]);

  const maxW = wide ? Math.min(width * 0.72, 1100) : width;
  const maxH = wide ? Math.min(height * 0.78, 820) : height - insets.top - insets.bottom - BAR * 2;
  // Desktop never blows small media up past 1.5x; phones always fill the available width or height.
  const fit = (w: number, h: number) => {
    const scale = Math.min(maxW / w, maxH / h, wide ? 1.5 : Infinity);
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  };

  const download = async () => {
    if (!media) return;
    setDownloading(true);
    setError(null);
    try {
      await openAttachment(media.url, media.name, media.mimeType);
    } catch (e) {
      setError({ url: media.url, text: e instanceof Error ? e.message : t('Could not download file') });
    } finally {
      setDownloading(false);
    }
  };

  const isVideo = !!media?.mimeType.startsWith('video/');
  const box = media && loaded?.url === media.url ? fit(loaded.width, loaded.height) : null;
  const errorText = media && error?.url === media.url ? error.text : '';
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal visible={!!media} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel={t('Close')} style={{ flex: 1, backgroundColor: 'rgba(5,7,11,0.86)', cursor: 'auto' } as any}>
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: BAR, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, zIndex: 2 }}>
          <T variant="labelLg" color="#fff" numberOfLines={1} style={{ flex: 1 }}>
            {media?.name}
          </T>
          {downloading ? (
            <View style={{ width: 44, alignItems: 'center' }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <IconButton name="download" label={t('Download')} {...BUTTON} onPress={() => void download()} />
          )}
          <IconButton name="x" label={t('Close')} {...BUTTON} onPress={onClose} />
        </View>

        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {media && (
            <Animated.View style={{ opacity: pop, transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
              {!isVideo && !box && <ActivityIndicator color={colors.amber} size="large" style={{ position: 'absolute' }} />}
              {/* Taps on the media itself must not close the viewer. */}
              <Pressable onPress={(e) => e.stopPropagation()} style={{ cursor: 'auto' } as any}>
                {isVideo ? (
                  <MediaVideo url={media.url} fit={fit} />
                ) : (
                  <Image
                    source={attachmentSource(media.url)}
                    onLoad={(e) => setLoaded({ url: media.url, width: e.source.width || 800, height: e.source.height || 600 })}
                    style={{ width: box?.width ?? 1, height: box?.height ?? 1, opacity: box ? 1 : 0, borderRadius: wide ? 12 : 0 }}
                    contentFit="contain"
                  />
                )}
              </Pressable>
            </Animated.View>
          )}
          {!!errorText && (
            <T variant="bodySm" color={colors.danger} style={{ marginTop: 12 }}>
              {errorText}
            </T>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}
