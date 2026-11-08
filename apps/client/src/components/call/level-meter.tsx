import { Platform, View } from 'react-native';

import { useAudioLevel } from '@/lib/audio-level';
import { colors } from '@/theme';

/**
 * Small vertical bar that fills and empties with a participant's audio level.
 * On web it reads the stream through a shared AnalyserNode; on native (no WebAudio) it follows
 * the call's speaking flag instead.
 */
export function LevelMeter({
  stream,
  speaking,
  silent,
  height = 28,
  width = 4,
  version = 0,
}: {
  stream: MediaStream | null | undefined;
  speaking?: boolean;
  /** Muted: show an empty bar whatever the stream says. */
  silent?: boolean;
  height?: number;
  width?: number;
  version?: number;
}) {
  const measured = useAudioLevel(stream, Platform.OS === 'web' && !silent, version);
  const level = silent ? 0 : Platform.OS === 'web' ? measured : speaking ? 0.7 : 0;
  return (
    <View
      pointerEvents="none"
      style={{ width, height, borderRadius: width / 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', justifyContent: 'flex-end' }}>
      <View
        style={{
          width,
          height: Math.round(height * level),
          borderRadius: width / 2,
          backgroundColor: level > 0.85 ? colors.danger : colors.amber,
        }}
      />
    </View>
  );
}
