import { useRef, useState } from 'react';
import { Platform, View, type GestureResponderEvent } from 'react-native';

import { isRTL } from '@/lib/i18n';
import { WAVE_BARS } from '@/lib/waveform';

const GAP = 1.5;
const BAR_MIN = 2;
/** How far a finger moves before it is a drag and no longer a tap. */
const SLOP = 6;
/** A press held longer than this is not a tap. */
const TAP_MS = 500;

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
  const touch = useRef<{ x: number; y: number; at: number; kind: 'tap' | 'scrub' | 'scroll' } | null>(null);
  /** Where a drag in progress points; the player only moves when it is let go. */
  const [scrub, setScrub] = useState<number | null>(null);
  // The played part starts at the layout's start edge, which is the right one in Persian.
  const fractionAt = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX ?? 0;
    return Math.max(0, Math.min(1, (isRTL() ? width - x : x) / width));
  };
  const release = () => {
    touch.current = null;
    setScrub(null);
  };
  const shown = scrub ?? progress;
  return (
    <View
      // A tap or a sideways drag seeks, on release. A vertical drag belongs to the chat list: seeking
      // on touch-down would start a message each time the list is scrolled from its waveform.
      onStartShouldSetResponder={() => !!onSeek && width > 0}
      onResponderTerminationRequest={() => touch.current?.kind !== 'scrub'}
      onResponderGrant={(e) => {
        touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, at: Date.now(), kind: 'tap' };
      }}
      onResponderMove={(e) => {
        const from = touch.current;
        if (!from) return;
        if (from.kind === 'tap') {
          const dx = Math.abs(e.nativeEvent.pageX - from.x);
          const dy = Math.abs(e.nativeEvent.pageY - from.y);
          if (dx > SLOP || dy > SLOP) from.kind = dx > dy ? 'scrub' : 'scroll';
        }
        if (from.kind === 'scrub') setScrub(fractionAt(e));
      }}
      onResponderRelease={(e) => {
        const from = touch.current;
        if (from?.kind === 'scrub' || (from?.kind === 'tap' && Date.now() - from.at < TAP_MS)) onSeek?.(fractionAt(e));
        release();
      }}
      onResponderTerminate={release}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={false}
      style={{
        height: HEIGHT,
        overflow: 'hidden',
        alignSelf: 'stretch',
        ...(Platform.OS === 'web' ? ({ cursor: onSeek ? 'pointer' : 'auto', touchAction: 'pan-y', userSelect: 'none' } as object) : null),
      }}>
      {row(rest)}
      {/* The played color is the same bars, clipped to the progress: it fills smoothly, even inside a bar. */}
      {width > 0 && shown > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, width: Math.min(1, shown) * width, overflow: 'hidden' }}>
          {row(played, width)}
        </View>
      )}
    </View>
  );
}
