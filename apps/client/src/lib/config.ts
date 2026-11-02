import { Platform } from 'react-native';

function resolveApiUrl() {
  // Desktop (Electron) injects the server URL at runtime, so one build works against any server.
  const desktop = typeof window !== 'undefined' ? (window as any).flockDesktop?.apiUrl : undefined;
  if (desktop) return String(desktop).replace(/\/$/, '');
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    // Served by the Docker nginx (same origin proxies /api and /socket.io).
    if (protocol.startsWith('http') && port !== '8081') return origin;
    return `http://${hostname || 'localhost'}:4000`;
  }
  // Android emulator reaches the host machine on 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();
