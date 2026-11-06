import { useRef, useState } from 'react';
import { Platform, View, type GestureResponderEvent, type ViewInstance } from 'react-native';

import { colors } from '@/theme';

/**
 * A plain 0…1 slider (no native module needed). Drag or tap anywhere on the track; arrow keys
 * nudge it on web. Always runs left-to-right, also in right-to-left layouts.
 */
export function Slider({
  value,
  onChange,
  label,
  step = 0.01,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  step?: number;
}) {
  const track = useRef<ViewInstance>(null);
  const bounds = useRef({ x: 0, width: 1 });
  const [dragging, setDragging] = useState(false);
  const v = Math.max(0, Math.min(1, value));

  const set = (pageX: number) => {
    const raw = (pageX - bounds.current.x) / bounds.current.width;
    const next = Math.round(Math.max(0, Math.min(1, raw)) / step) * step;
    onChange(Math.round(next * 1000) / 1000);
  };
  const start = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    setDragging(true);
    // Measure on every grab: the panel may have scrolled or moved since the last layout.
    track.current?.measureInWindow((x: number, _y: number, width: number) => {
      bounds.current = { x, width: width || 1 };
      set(pageX);
    });
  };

  const thumb = dragging ? 20 : 16;
  return (
    <View
      ref={track}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(1, v + 0.05));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(0, v - 0.05));
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={start}
      onResponderMove={(e) => set(e.nativeEvent.pageX)}
      onResponderRelease={() => setDragging(false)}
      onResponderTerminate={() => setDragging(false)}
      {...(Platform.OS === 'web'
        ? {
            tabIndex: 0,
            onKeyDown: (e: { key: string }) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(1, Math.round((v + 0.05) * 100) / 100));
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, Math.round((v - 0.05) * 100) / 100));
            },
          }
        : {}) as object}
      style={[{ height: 32, justifyContent: 'center', direction: 'ltr' }, Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'none', userSelect: 'none' } as object) : null]}>
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHighest, overflow: 'hidden' }}>
        <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: colors.amber }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${v * 100}%`,
          marginLeft: -thumb / 2,
          width: thumb,
          height: thumb,
          borderRadius: thumb / 2,
          backgroundColor: colors.amber,
          borderWidth: 3,
          borderColor: colors.canvas,
        }}
      />
    </View>
  );
}
