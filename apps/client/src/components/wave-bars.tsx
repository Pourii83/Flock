import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { WAVE_BARS } from '@/lib/waveform';

/**
 * The timeline of a voice message: one bar per slice, as tall as that slice is loud. Played bars
 * take the strong color; tapping a spot seeks there.
 */
export function WaveBars({
  levels,
  progress,
  played,
  rest,
  onSeek,
}: {
  levels: number[] | null;
  progress: number;
  played: string;
  rest: string;
  onSeek?: (fraction: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // Until the bars are known, a quiet flat line.
  const bars = levels ?? Array.from({ length: WAVE_BARS }, () => 0.08);
  const HEIGHT = 26;
  return (
    <Pressable
      onPress={(e: any) => onSeek && width > 0 && onSeek(Math.max(0, Math.min(1, (e.nativeEvent.locationX ?? 0) / width)))}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={false}
      style={{ height: HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 1.5 }}>
      {bars.map((level, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            flex: 1,
            height: Math.max(4, Math.round(level * HEIGHT)),
            minWidth: 2,
            borderRadius: 2,
            backgroundColor: (i + 0.5) / bars.length <= progress ? played : rest,
          }}
        />
      ))}
    </Pressable>
  );
}
