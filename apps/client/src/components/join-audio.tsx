// Microphone and speaker pickers on a meeting link page, before someone without an account joins.
// The choice is stored where calls read it (state/calls.tsx), so the call opens on these devices.
// Opening the microphone list starts that mic, so a live bar beside it shows what it picks up:
// the same vertical level meter the call screen uses (components/call/level-meter.tsx).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { callAudio, type AudioDeviceChoice } from '@/lib/native-media';
import { playTestTone } from '@/lib/test-tone';
import { saveDevice, savedDevice } from '@/state/calls';
import { colors, radius } from '@/theme';
import { LevelMeter } from './call/level-meter';
import { Button, Icon, T } from './ui';

type Kind = 'input' | 'output';

/** Native phones pair their microphone and speaker by route, so the pickers are web-only. */
export const joinAudioSupported =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** The processing a call applies, so the meter shows what the others would hear. */
const PROCESSING = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export function JoinAudio() {
  const [devices, setDevices] = useState<AudioDeviceChoice[]>([]);
  const [inputId, setInputId] = useState(() => savedDevice('input'));
  const [outputId, setOutputId] = useState(() => savedDevice('output'));
  const [open, setOpen] = useState<Kind | null>(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState<'idle' | 'playing' | 'failed'>('idle');
  // The microphone held open while its list is showing: measures the level, nothing is recorded.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const asked = useRef(false);

  const refresh = useCallback(
    () =>
      callAudio.devices().then(
        (status) => setDevices(status.devices),
        () => {},
      ),
    [],
  );

  // The list, and again whenever a microphone or speaker is plugged in or out.
  useEffect(() => {
    void refresh();
    return callAudio.watchDevices(() => void refresh());
  }, [refresh]);

  const stopListening = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // Leaving the page releases the microphone.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const micError = (e: any) =>
    setError(
      e?.name === 'NotAllowedError'
        ? t('Flock isn’t allowed to use the microphone. Allow it in the browser’s site settings.')
        : t('Couldn’t open the microphone.'),
    );

  /** Opens the chosen microphone and keeps it for the level bar (also asks for permission). */
  const listen = async (id: string) => {
    stopListening();
    try {
      let next: MediaStream;
      try {
        next = await navigator.mediaDevices.getUserMedia({
          audio: id && id !== 'default' ? { ...PROCESSING, deviceId: { exact: id } } : PROCESSING,
        });
      } catch (e: any) {
        // A device remembered from another session can be gone: fall back to the default one.
        if (!id || id === 'default' || e?.name !== 'OverconstrainedError') throw e;
        next = await navigator.mediaDevices.getUserMedia({ audio: PROCESSING });
      }
      streamRef.current = next;
      setStream(next);
      setError('');
      // Allowed now: the browser lists the real names.
      await refresh();
    } catch (e: any) {
      micError(e);
    }
  };

  /** Browsers hide device names until the microphone has been allowed once (the call needs it anyway). */
  const allow = async () => {
    if (asked.current) return;
    asked.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refresh();
    } catch (e: any) {
      // A retry can help (the mic was busy, or it has just been allowed in the site settings).
      asked.current = false;
      micError(e);
    }
  };

  const toggle = (kind: Kind) => {
    // Leaving the microphone list releases the mic (the level bar was the only thing using it).
    if (open === 'input' && kind !== 'input') stopListening();
    if (open === kind) {
      setOpen(null);
      if (kind === 'input') stopListening();
      return;
    }
    setOpen(kind);
    if (kind === 'input') void listen(inputId);
    else void allow();
  };

  const chosen = (kind: Kind) => (kind === 'input' ? inputId : outputId);
  const label = (kind: Kind) =>
    devices.find((device) => device.kind === kind && device.id === chosen(kind))?.label ?? t('System default');

  const pick = (kind: Kind, id: string) => {
    saveDevice(kind, id);
    if (kind === 'input') {
      setInputId(id);
      // The list stays open: the level bar shows what this microphone picks up.
      void listen(id);
      return;
    }
    setOutputId(id);
    setTone('idle');
    setOpen(null);
  };

  const testSound = async () => {
    setTone('playing');
    setTone((await playTestTone(outputId)) ? 'idle' : 'failed');
  };

  const picker = (kind: Kind) => {
    const list = devices.filter((device) => device.kind === kind);
    const isOpen = open === kind;
    const glyph = kind === 'input' ? ('mic' as const) : ('volume-2' as const);
    return (
      <View style={{ gap: 6 }}>
        <Pressable
          onPress={() => toggle(kind)}
          accessibilityRole="button"
          accessibilityLabel={kind === 'input' ? t('Microphone') : t('Speaker')}
          accessibilityState={{ expanded: isOpen }}
          style={({ hovered }: any) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: radius.lg,
            backgroundColor: hovered ? colors.surfaceHigh : colors.canvas,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
          })}>
          <Icon name={glyph} size={16} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="labelSm" color={colors.textMuted}>
              {kind === 'input' ? t('Microphone') : t('Speaker')}
            </T>
            <T variant="body" numberOfLines={1}>
              {label(kind)}
            </T>
          </View>
          <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </Pressable>
        {isOpen && (
          <>
            <View
              accessibilityRole="radiogroup"
              style={{
                padding: 4,
                borderRadius: radius.lg,
                backgroundColor: colors.canvas,
                borderWidth: 1,
                borderColor: colors.surfaceHigh,
              }}>
              {(list.length ? list : [{ id: 'default', label: t('System default'), kind }]).map((device) => {
                const on = device.id === chosen(kind);
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => pick(kind, device.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: radius.md,
                      backgroundColor: on ? colors.amberTint : hovered ? colors.surfaceHigh : 'transparent',
                    })}>
                    <Icon name={on ? 'check' : glyph} size={16} color={on ? colors.amberText : colors.textMuted} />
                    <T
                      variant="body"
                      numberOfLines={1}
                      color={on ? colors.amberText : colors.text}
                      style={{ flex: 1, minWidth: 0 }}>
                      {device.label}
                    </T>
                    {kind === 'input' && (
                      // Only the microphone in use is open, so only its row fills.
                      <LevelMeter stream={on ? stream : null} height={24} width={4} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            {kind === 'output' && (
              <Button
                title={tone === 'failed' ? t('Could not play the test sound') : t('Test sound')}
                size="sm"
                variant="ghost"
                loading={tone === 'playing'}
                onPress={() => void testSound()}
              />
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 8 }}>
      {picker('input')}
      {picker('output')}
      <T variant="bodySm" color={colors.textMuted}>
        {t('Used when you join this meeting.')}
      </T>
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}
