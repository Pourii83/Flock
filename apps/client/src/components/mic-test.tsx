// Microphone check in Settings (web and the Windows app): a live level meter, so people can see that
// Flock hears them before they join a call. The sound stays on this device; nothing is recorded or sent.
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { Button, Icon, T } from './ui';

const SEGMENTS = 20;
/** Quieter than this (dBFS) shows as silence; 0 dBFS fills the meter. */
const FLOOR_DB = -60;

export const micTestSupported =
  Platform.OS === 'web' && typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof (window as any).AudioContext !== 'undefined';

type Session = { stream: MediaStream; ctx: AudioContext; timer: ReturnType<typeof setInterval> };

export function MicTest() {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [device, setDevice] = useState('');
  const [error, setError] = useState('');
  const session = useRef<Session | null>(null);

  const stop = () => {
    const s = session.current;
    session.current = null;
    if (s) {
      clearInterval(s.timer);
      s.stream.getTracks().forEach((track) => track.stop());
      void s.ctx.close().catch(() => {});
    }
    setRunning(false);
    setLevel(0);
  };

  // Leaving Settings turns the microphone off.
  useEffect(() => () => {
    const s = session.current;
    if (!s) return;
    clearInterval(s.timer);
    s.stream.getTracks().forEach((track) => track.stop());
    void s.ctx.close().catch(() => {});
  }, []);

  const start = async () => {
    setError('');
    try {
      // The same processing a call uses, so the meter shows what the others would hear.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      // A timer, not requestAnimationFrame: frames stop in windows that aren't painted.
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
        const next = Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
        // Rise at once, fall gently, like a hardware meter.
        setLevel((prev) => (next > prev ? next : prev * 0.85 + next * 0.15));
      }, 50);
      session.current = { stream, ctx, timer };
      setDevice(stream.getAudioTracks()[0]?.label ?? '');
      setRunning(true);
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? t('Flock isn’t allowed to use the microphone. Allow it in the browser’s site settings.')
          : e?.name === 'NotFoundError'
            ? t('No microphone found.')
            : t('Couldn’t open the microphone.'),
      );
    }
  };

  const lit = Math.round(level * SEGMENTS);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="labelLg">{t('Microphone test')}</T>
          <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
            {running ? device || t('Default microphone') : t('Check that Flock hears you before a call.')}
          </T>
        </View>
        <Button title={running ? t('Stop') : t('Test mic')} icon={running ? 'square' : 'mic'} size="sm" variant={running ? 'ghost' : 'primary'} onPress={running ? stop : () => void start()} />
      </View>
      {running && (
        <View style={{ gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.surfaceHigh }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="activity" size={14} color={level > 0.05 ? colors.online : colors.textMuted} />
            <T variant="bodySm" color={colors.textMuted}>
              {level > 0.05 ? t('Hearing you') : t('Say something — the bars should move.')}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: SEGMENTS, now: lit }}>
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const on = i < lit;
              const tone = i >= SEGMENTS * 0.85 ? colors.danger : i >= SEGMENTS * 0.6 ? colors.amber : colors.online;
              return <View key={i} style={{ flex: 1, height: 12, borderRadius: 3, backgroundColor: on ? tone : colors.surfaceHigh }} />;
            })}
          </View>
        </View>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}
