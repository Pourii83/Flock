// Microphone and speaker pickers on a meeting link page, before someone without an account joins.
// The choice is stored where calls read it (state/calls.tsx), so the call opens on these devices.
// While the microphone list is open every microphone in it is live, each with the same vertical
// level meter the call screen uses (components/call/level-meter.tsx), so they can be compared
// before picking one. Nothing is recorded.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { callAudio, ROUTE_PREFIX, type AudioDeviceChoice } from '@/lib/native-media';
import { playTestTone } from '@/lib/test-tone';
import {
  savedDevice,
  savedStartMuted,
  savedStartSpeakerMuted,
  saveDevice,
  saveStartMuted,
  saveStartSpeakerMuted,
} from '@/state/calls';
import { colors, nestedRadius, radius } from '@/theme';
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

/** Opens exactly the microphone asked for, so each level bar shows its own row's device. */
const openMic = (id: string) =>
  navigator.mediaDevices.getUserMedia({
    audio: id === 'default' ? PROCESSING : { ...PROCESSING, deviceId: { exact: id } },
  });

const stopStream = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

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

/** `joining`: the call is opening its own microphone, so the previews let go of theirs. */
export function JoinAudio({ joining }: { joining: boolean }) {
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
  // Bumped on every release: a microphone that finishes opening after that is stopped at once.
  const session = useRef(0);

  // Joining closes the lists: if it fails they are opened again, with live bars.
  const [wasJoining, setWasJoining] = useState(joining);
  if (wasJoining !== joining) {
    setWasJoining(joining);
    if (joining) {
      setOpen(null);
      setStreams({});
    }
  }

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

  const releaseMics = useCallback(() => {
    session.current++;
    streamsRef.current.forEach(stopStream);
    streamsRef.current.clear();
  }, []);

  const stopListening = useCallback(() => {
    releaseMics();
    setStreams({});
  }, [releaseMics]);

  // Leaving the page, or starting to join, releases every microphone, also those still opening.
  useEffect(() => {
    if (joining) releaseMics();
    return releaseMics;
  }, [joining, releaseMics]);

  // The sign-in page opens over this one, which stays mounted: out of sight, no microphone stays on.
  useFocusEffect(
    useCallback(
      () => () => {
        stopListening();
        setOpen(null);
      },
      [stopListening],
    ),
  );

  const micError = (e: any) =>
    setError(
      e?.name === 'NotAllowedError'
        ? t('Flock isn’t allowed to use the microphone. Allow it in the browser’s site settings.')
        : t('Couldn’t open the microphone.'),
    );

  /** Opens one microphone for its level bar; false when it came too late or couldn't open. */
  const listen = async (id: string, turn: number, report = true) => {
    try {
      const stream = await openMic(id);
      if (turn !== session.current) {
        stopStream(stream);
        return false;
      }
      const previous = streamsRef.current.get(id);
      if (previous) stopStream(previous);
      streamsRef.current.set(id, stream);
      setStreams(Object.fromEntries(streamsRef.current));
      if (report) setError('');
      return true;
    } catch (e: any) {
      if (report && turn === session.current) micError(e);
      return false;
    }
  };

  /** Opens the listed microphones at once, so their meters can be compared before picking one. */
  const openMics = async () => {
    stopListening();
    const turn = session.current;
    // The default one first: browsers list the others only once the microphone has been allowed.
    const allowed = await listen('default', turn);
    if (turn !== session.current) return;
    const status = await callAudio.devices().catch(() => null);
    if (!status || turn !== session.current) return;
    setDevices(status.devices);
    const ids = status.devices.filter((device) => device.kind === 'input').map((device) => device.id);
    // Only a list read with permission can tell that the remembered microphone is gone.
    if (allowed && inputId !== 'default' && !ids.includes(inputId)) {
      setInputId('default');
      saveDevice('input', 'default');
    }
    const others = ids.filter((id) => id !== 'default');
    // The chosen one always gets a bar, however long the list is.
    const wanted = [...others.filter((id) => id === inputId), ...others.filter((id) => id !== inputId)];
    await Promise.all(wanted.slice(0, MAX_OPEN - 1).map((id) => listen(id, turn, false)));
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
    }
    // The speaker list never asks for the microphone: without permission it offers the system default.
  };

  // Phones list call routes instead of speakers, and a route is switched by the microphone it pairs
  // with (see lib/native-media.ts). Left alone, a call starts on a headset, else on the loudspeaker.
  const routes = devices.filter((device) => device.kind === 'output' && device.id.startsWith(ROUTE_PREFIX));
  const route =
    routes.find((device) => device.id === ROUTE_PREFIX + inputId) ??
    routes.find((device) => device.route === 'headset') ??
    routes.find((device) => device.route === 'speaker');

  const chosen = (kind: Kind) => (kind === 'input' ? inputId : (route?.id ?? outputId));
  const label = (kind: Kind) =>
    devices.find((device) => device.kind === kind && device.id === chosen(kind))?.label ?? t('System default');

  const pick = (kind: Kind, id: string) => {
    if (kind === 'output' && id.startsWith(ROUTE_PREFIX)) {
      const mic = id.slice(ROUTE_PREFIX.length);
      saveDevice('input', mic);
      setInputId(mic);
      setOpen(null);
      return;
    }
    saveDevice(kind, id);
    if (kind === 'input') {
      setInputId(id);
      // The list stays open: the level bar shows what this microphone picks up.
      if (!streamsRef.current.has(id)) void listen(id, session.current);
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
            disabled={joining}
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
                      borderRadius: nestedRadius(radius.lg, 5),
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
