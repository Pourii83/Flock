import type { ComponentType } from 'react';
import { View } from 'react-native';

import { initNativeWebRTC } from '@/lib/native-media';

type RTCViewProps = { streamURL?: string; mirror?: boolean; objectFit?: 'contain' | 'cover'; zOrder?: number; style?: object };

// Expo Go has no WebRTC native module; we render an empty frame there instead of crashing.
const RTCView: ComponentType<RTCViewProps> | null = initNativeWebRTC()
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    require('react-native-webrtc').RTCView
  : null;

/** Native renderer for a react-native-webrtc MediaStream. */
export function VideoView({
  stream,
  mirror,
  contain,
  overlay,
}: {
  stream: MediaStream | null;
  mirror?: boolean;
  muted?: boolean;
  contain?: boolean;
  /** Draw above other video surfaces (picture-in-picture self view). */
  overlay?: boolean;
}) {
  const url = (stream as (MediaStream & { toURL?: () => string }) | null)?.toURL?.();
  if (!RTCView || !url) return <View style={{ flex: 1 }} />;
  return <RTCView streamURL={url} mirror={mirror} objectFit={contain ? 'contain' : 'cover'} zOrder={overlay ? 1 : 0} style={{ flex: 1 }} />;
}
