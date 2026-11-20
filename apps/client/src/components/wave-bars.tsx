import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { WAVE_BARS } from '@/lib/waveform';

const GAP = 1.5;
const BAR_MIN = 2;

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
  // Until the bars are known, a quiet flat line. In a narrow space neighbouring bars merge (keeping
  // the louder one), so the waveform always fits the width it gets.
  const all = levels ?? Array.from({ length: WAVE_BARS }, () => 0.08);
  const fit = width > 0 ? Math.max(8, Math.floor((width + GAP) / (BAR_MIN + GAP))) : all.length;
  const bars =
    all.length <= fit
      ? all
      : Array.from({ length: fit }, (_, i) => {
          const from = Math.floor((i * all.length) / fit);
          const to = Math.max(from + 1, Math.floor(((i + 1) * all.length) / fit));
          return Math.max(...all.slice(from, to));
        });
  const HEIGHT = 26;
  const row = (color: string, rowWidth?: number) => (
    <View
      pointerEvents="none"
      style={{ height: HEIGHT, flexDirection: 'row', alignItems: 'center', gap: GAP, ...(rowWidth ? { width: rowWidth } : { alignSelf: 'stretch' }) }}>
      {bars.map((level, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(4, Math.round(level * HEIGHT)), minWidth: BAR_MIN, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
  return (
    <Pressable
      onPress={(e: any) => onSeek && width > 0 && onSeek(Math.max(0, Math.min(1, (e.nativeEvent.locationX ?? 0) / width)))}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={false}
      style={{ height: HEIGHT, overflow: 'hidden', alignSelf: 'stretch' }}>
      {row(rest)}
      {/* The played color is the same bars, clipped to the progress: it fills smoothly, even inside a bar. */}
      {width > 0 && progress > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, width: Math.min(1, progress) * width, overflow: 'hidden' }}>
          {row(played, width)}
        </View>
      )}
    </Pressable>
  );
}
