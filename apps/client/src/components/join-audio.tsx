// Microphone and speaker pickers on a meeting link page, before someone without an account joins.
// The choice is stored where calls read it (state/calls.tsx), so the call opens on these devices.
// While the microphone list is open every microphone in it is live, each with the same vertical
// level meter the call screen uses (components/call/level-meter.tsx), so they can be compared
// before picking one. Nothing is recorded.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { callAudio, type AudioDeviceChoice } from '@/lib/native-media';
import { playTestTone } from '@/lib/test-tone';
import {
  savedDevice,
  savedStartMuted,
  savedStartSpeakerMuted,
  saveDevice,
  saveStartMuted,
  saveStartSpeakerMuted,
} from '@/state/calls';
import { colors, radius } from '@/theme';
import { LevelMeter } from './call/level-meter';
import { Button, Icon, T } from './ui';

type Kind = 'input' | 'output';

/** Native phones pair their microphone and speaker by route, so the pickers are web-only. */
export const joinAudioSupported =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** The processing a call applies, so the meter shows what the others would hear. */
const PROCESSING = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** More microphones than this opened at once would be more than a comparison needs. */
const MAX_OPEN = 6;

/**
 * Opens one microphone. A device remembered from another session can be gone: the browser then
 * answers OverconstrainedError and the default one is opened instead. Resolves with the device
 * that really opened, which is the one to show as chosen.
 */
async function openMic(id: string): Promise<{ stream: MediaStream; id: string }> {
  const exact = id && id !== 'default' ? { ...PROCESSING, deviceId: { exact: id } } : PROCESSING;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: exact });
    return { stream, id: stream.getAudioTracks()[0]?.getSettings().deviceId ?? id };
  } catch (e: any) {
    if (!id || id === 'default' || e?.name !== 'OverconstrainedError') throw e;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: PROCESSING });
    return { stream, id: 'default' };
  }
}

/** The circle the call screen uses for its microphone and speaker, so the choice reads the same here. */
function RoundToggle({
  on,
  icon,
  label,
  onPress,
}: {
  on: boolean;
  icon: 'mic' | 'mic-off' | 'volume-2' | 'volume-x';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-pressed={on}
      style={({ pressed, hovered }: any) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: !on ? colors.dangerTint : hovered || pressed ? colors.surfaceHighest : colors.amberGlow,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}>
      <Icon name={icon} size={17} color={!on ? colors.danger : colors.amberText} />
    </Pressable>
  );
}

export function JoinAudio() {
  const [devices, setDevices] = useState<AudioDeviceChoice[]>([]);
  const [inputId, setInputId] = useState(() => savedDevice('input'));
  const [outputId, setOutputId] = useState(() => savedDevice('output'));
  const [open, setOpen] = useState<Kind | null>(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState<'idle' | 'playing' | 'failed'>('idle');
  const [muted, setMuted] = useState(() => savedStartMuted());
  const [speakerMuted, setSpeakerMuted] = useState(() => savedStartSpeakerMuted());
  // The microphones held open while the list is showing, by device id: they only feed the meters.
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
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
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current.clear();
    setStreams({});
  }, []);

  // Leaving the page releases every microphone.
  useEffect(
    () => () => {
      streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      streamsRef.current.clear();
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
    try {
      const { stream, id: actual } = await openMic(id);
      const previous = streamsRef.current.get(actual);
      if (previous) previous.getTracks().forEach((track) => track.stop());
      streamsRef.current.set(actual, stream);
      setStreams(Object.fromEntries(streamsRef.current));
      setError('');
      await refresh();
      // The remembered microphone was gone and another one opened: say so, and keep that one.
      if (actual !== id) {
        setInputId(actual);
        saveDevice('input', actual);
      }
    } catch (e: any) {
      micError(e);
    }
  };

  /** Opens every listed microphone at once, so their meters can be compared before picking one. */
  const listenAll = async () => {
    stopListening();
    // Read the list now, not the one from the click: allowing the microphone reveals the rest.
    const status = await callAudio.devices().catch(() => null);
    const ids = (status?.devices ?? []).filter((device) => device.kind === 'input').map((device) => device.id);
    const wanted = (ids.length ? ids : ['default']).slice(0, MAX_OPEN);
    let firstError: any = null;
    const opened = (
      await Promise.all(
        wanted.map(async (id) => {
          try {
            return await openMic(id);
          } catch (e) {
            firstError = firstError ?? e;
            return null;
          }
        }),
      )
    ).filter((item): item is { stream: MediaStream; id: string } => !!item);
    if (!opened.length) {
      micError(firstError);
      return;
    }
    const next = new Map<string, MediaStream>();
    for (const { stream, id } of opened) {
      // Two devices can fall back to the same default one; one stream per row is enough.
      if (next.has(id)) stream.getTracks().forEach((track) => track.stop());
      else next.set(id, stream);
    }
    streamsRef.current = next;
    setStreams(Object.fromEntries(next));
    setError('');
    await refresh();
    // The remembered microphone is gone: the default one is what will open in the call.
    if (inputId !== 'default' && !next.has(inputId) && next.has('default')) {
      setInputId('default');
      saveDevice('input', 'default');
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

  /** Opens the microphone list and every microphone in it (asking for permission first if needed). */
  const openMics = async () => {
    if (!devices.some((device) => device.kind === 'input')) await allow();
    await listenAll();
  };

  const toggle = (kind: Kind) => {
    // Leaving the microphone list releases the microphones (the level bars were their only use).
    if (open === 'input' && kind !== 'input') stopListening();
    if (open === kind) {
      setOpen(null);
      if (kind === 'input') stopListening();
      return;
    }
    setOpen(kind);
    if (kind === 'input') {
      void openMics();
    } else if (!devices.some((device) => device.kind === 'output')) {
      // Only needed to reveal the speaker names; a microphone prompt would be out of place here.
      void allow();
    }
  };

  const chosen = (kind: Kind) => (kind === 'input' ? inputId : outputId);
  const label = (kind: Kind) =>
    devices.find((device) => device.kind === kind && device.id === chosen(kind))?.label ?? t('System default');

  const pick = (kind: Kind, id: string) => {
    saveDevice(kind, id);
    if (kind === 'input') {
      setInputId(id);
      // The list stays open: the level bar shows what this microphone picks up.
      if (!streamsRef.current.has(id)) void listen(id);
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

  const chooseMute = () => {
    const next = !muted;
    setMuted(next);
    saveStartMuted(next);
  };

  const chooseSpeaker = () => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    saveStartSpeakerMuted(next);
  };

  const picker = (kind: Kind) => {
    const list = devices.filter((device) => device.kind === kind);
    const isOpen = open === kind;
    const glyph = kind === 'input' ? ('mic' as const) : ('volume-2' as const);
    return (
      <View style={{ gap: 6 }}>
        {/* The call's own circle beside the device: the choice is made here, before joining. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
              flex: 1,
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
        {kind === 'input' ? (
          <RoundToggle
            on={!muted}
            icon={muted ? 'mic-off' : 'mic'}
            label={muted ? t('Unmute') : t('Mute')}
            onPress={chooseMute}
          />
        ) : (
          <RoundToggle
            on={!speakerMuted}
            icon={speakerMuted ? 'volume-x' : 'volume-2'}
            label={speakerMuted ? t('Unmute call audio') : t('Mute call audio')}
            onPress={chooseSpeaker}
          />
        )}
        </View>
        {/* The test belongs to the speaker, not to its list: it works with the list closed too. */}
        {kind === 'output' && (
          <Button
            title={tone === 'failed' ? t('Could not play the test sound') : t('Test sound')}
            size="sm"
            variant="ghost"
            loading={tone === 'playing'}
            onPress={() => void testSound()}
          />
        )}
        {isOpen && (
          <>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={kind === 'input' ? t('Microphone') : t('Speaker')}
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
                    accessibilityLabel={device.label}
                    aria-checked={on}
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
                      // Every microphone in the open list is live, so they can be compared by eye.
                      <LevelMeter stream={streams[device.id] ?? null} height={24} width={4} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            {kind === 'input' && (
              <T variant="bodySm" color={colors.textMuted}>
                {t('Speak and watch the bars to compare microphones.')}
              </T>
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
