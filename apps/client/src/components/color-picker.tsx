import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

import { colors } from '@/theme';

type HSV = { h: number; s: number; v: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const part = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${part(f(5))}${part(f(3))}${part(f(1))}`.toUpperCase();
}

export function hexToHsv(hex: string): HSV | null {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/**
 * Drag handling shared by both areas: the finger's start point plus its movement, so it behaves the
 * same on touch screens and with a mouse (locationX is unreliable while a drag leaves the element).
 */
function useDrag(onMove: (x: number, y: number, width: number, height: number) => void) {
  const size = useRef({ width: 1, height: 1 });
  const start = useRef({ x: 0, y: 0 });
  const handler = useRef(onMove);
  useEffect(() => {
    handler.current = onMove;
  });
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        start.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        handler.current(start.current.x, start.current.y, size.current.width, size.current.height);
      },
      onPanResponderMove: (_event, gesture) =>
        handler.current(start.current.x + gesture.dx, start.current.y + gesture.dy, size.current.width, size.current.height),
    }),
  );
  const onLayout = (event: LayoutChangeEvent) => {
    size.current = { width: event.nativeEvent.layout.width || 1, height: event.nativeEvent.layout.height || 1 };
  };
  return { panHandlers: responder.panHandlers, onLayout };
}

const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;
const THUMB = 22;

/** Pick any color: a saturation/brightness square plus a hue strip. Reports #RRGGBB while dragging. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? { h: 40, s: 0.7, v: 1 });
  const [box, setBox] = useState({ width: 1, height: 1 });
  const [strip, setStrip] = useState(1);

  // A hex typed (or a preset tapped) elsewhere moves the thumbs; our own drags don't loop back.
  useEffect(() => {
    const parsed = hexToHsv(value);
    if (parsed && hsvToHex(hsv) !== value.toUpperCase()) setHsv(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the outside value
  }, [value]);

  const update = (next: HSV) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const square = useDrag((x, y, w, h) => update({ ...hsv, s: clamp(x / w, 0, 1), v: 1 - clamp(y / h, 0, 1) }));
  const hue = useDrag((x, _y, w) => update({ ...hsv, h: clamp(x / w, 0, 1) * 359.99 }));

  return (
    <View style={{ gap: 14 }}>
      <View
        {...square.panHandlers}
        onLayout={(event) => {
          square.onLayout(event);
          setBox({ width: event.nativeEvent.layout.width || 1, height: event.nativeEvent.layout.height || 1 });
        }}
        style={{ height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}>
        <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', inset: 0 }} pointerEvents="none" />
        <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', inset: 0 }} pointerEvents="none" />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hsv.s * box.width - THUMB / 2,
            top: (1 - hsv.v) * box.height - THUMB / 2,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            backgroundColor: hsvToHex(hsv),
          }}
        />
      </View>
      <View
        {...hue.panHandlers}
        onLayout={(event) => {
          hue.onLayout(event);
          setStrip(event.nativeEvent.layout.width || 1);
        }}
        style={{ height: THUMB, borderRadius: THUMB / 2, justifyContent: 'center' }}>
        <LinearGradient colors={HUES} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 14, borderRadius: 7 }} pointerEvents="none" />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (hsv.h / 360) * strip - THUMB / 2,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
            shadowColor: colors.canvas,
          }}
        />
      </View>
    </View>
  );
}
