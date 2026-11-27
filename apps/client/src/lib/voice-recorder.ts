// Records a voice message in the browser / Windows app with MediaRecorder. The Android app can play
// voice messages but not record them yet (that needs a native recorder module and a new APK).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { measureWave } from './waveform';

export const canRecordVoice =
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Opus in WebM (Chrome, Firefox, Electron); MP4/AAC where that's all there is (Safari). */
function pickMime() {
  const MR = (window as any).MediaRecorder as typeof MediaRecorder;
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) if (MR.isTypeSupported?.(type)) return type;
  return '';
}

/** waveform: the loudness bars measured from the recording (sent with the message). */
/**
 * Phones: the browser's permission prompt would interrupt a held finger, so the first touch only asks
 * for the microphone. Resolves true when it is already allowed.
 */
export async function microphoneAllowed(): Promise<boolean> {
  try {
    const status = await (navigator as any).permissions?.query({ name: 'microphone' });
    if (status?.state === 'granted') return true;
    if (status?.state === 'denied') throw new Error('denied');
  } catch (e) {
    if (e instanceof Error && e.message === 'denied') throw e;
    // No Permissions API for the microphone (some browsers): just try to record.
    return true;
  }
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  mic.getTracks().forEach((track) => track.stop());
  return false;
}

export type VoiceClip = { file: File; seconds: number; waveform: string | null };

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // A locked recording can pause; the time paused doesn't count toward its length.
  const [paused, setPaused] = useState(false);
  const before = useRef(0);
  const pausedNow = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const elapsed = () => before.current + (pausedNow.current ? 0 : Date.now() - startedAt.current);
  const finish = useRef<((clip: VoiceClip | null) => void) | null>(null);
  // The start still waiting for the microphone, and whether the chat is off screen.
  const opening = useRef<symbol | null>(null);
  const away = useRef(false);

  // Leaving the chat drops a recording that hasn't begun. Tabs stay mounted, so that is losing focus.
  useFocusEffect(
    useCallback(() => {
      away.current = false;
      return () => {
        away.current = true;
        opening.current = null;
      };
    }, []),
  );

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => setSeconds(Math.floor(elapsed() / 1000)), 250);
    return () => clearInterval(id);
  }, [recording, paused]);

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    before.current = 0;
    pausedNow.current = false;
    setRecording(false);
    setPaused(false);
    setSeconds(0);
  };

  // Leaving the chat mid-recording throws the recording away.
  useEffect(
    () => () => {
      finish.current = null;
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  /** Starts recording; throws if the microphone can't be used. */
  const start = async () => {
    // `away`: the permission check before this can outlast the visit to the chat.
    if (!canRecordVoice || recorder.current || opening.current || away.current) return;
    const attempt = Symbol();
    opening.current = attempt;
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      if (opening.current !== attempt) return;
      opening.current = null;
      throw e;
    }
    if (opening.current !== attempt) {
      mic.getTracks().forEach((track) => track.stop());
      return;
    }
    opening.current = null;
    const mimeType = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(mic, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    } catch (e) {
      mic.getTracks().forEach((track) => track.stop());
      throw e;
    }
    chunks.current = [];
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    rec.onstop = async () => {
      const done = finish.current;
      finish.current = null;
      const secondsTaken = elapsed() / 1000;
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0]!;
      const blob = new Blob(chunks.current, { type });
      release();
      if (!done) return;
      if (!blob.size || secondsTaken < 0.6) return done(null);
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const waveform = await measureWave(await blob.arrayBuffer()).catch(() => null);
      done({ file: new File([blob], `voice-${stamp}.${ext}`, { type }), seconds: secondsTaken, waveform });
    };
    stream.current = mic;
    recorder.current = rec;
    startedAt.current = Date.now();
    before.current = 0;
    pausedNow.current = false;
    try {
      rec.start(250);
    } catch (e) {
      release();
      throw e;
    }
    setSeconds(0);
    setRecording(true);
  };

  /** Stops and hands back the clip (null if it was too short). */
  const stop = () =>
    new Promise<VoiceClip | null>((resolve) => {
      const rec = recorder.current;
      if (!rec || rec.state === 'inactive') return resolve(null);
      finish.current = resolve;
      rec.stop();
    });

  /** Pauses or resumes a recording in progress. */
  const togglePause = () => {
    const rec = recorder.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      before.current += Date.now() - startedAt.current;
      pausedNow.current = true;
      rec.pause();
      setPaused(true);
    } else if (rec.state === 'paused') {
      startedAt.current = Date.now();
      pausedNow.current = false;
      rec.resume();
      setPaused(false);
    }
  };

  const cancel = () => {
    opening.current = null;
    finish.current = null;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else release();
  };

  return { recording, paused, seconds, start, stop, cancel, togglePause };
}
