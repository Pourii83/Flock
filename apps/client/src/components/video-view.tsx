import { View } from 'react-native';

// Native builds don't ship WebRTC yet (needs react-native-webrtc in a dev build); render nothing.
export function VideoView(_: { stream: MediaStream | null; mirror?: boolean; muted?: boolean; contain?: boolean }) {
  return <View style={{ flex: 1 }} />;
}
