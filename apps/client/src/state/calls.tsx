import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, PixelRatio, Platform } from 'react-native';

import { callAudio, switchCamera, type AudioDeviceChoice } from '@/lib/native-media';
import { api } from '@/lib/api';
import { getNoisePreference, micConstraints, processMic, strongNoiseSupported, type NoiseMode } from '@/lib/noise';
import { createPeer, getCameraTrack, getLocalMedia, loadIceConfig, rtcSupported } from '@/lib/rtc';
import type { Conversation, User } from '@/lib/types';
import { useAuth } from './auth';
import { chatStore, useChat } from './chat-store';
import { t } from '@/lib/i18n';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active';

export type CallChatMessage = { id: string; mine: boolean; text: string; at: number; author?: string };
export type VoiceBitrate = 160 | 320;
export type StreamQuality = '2k' | '1080p' | '720p' | '480p';
export type StreamFps = 60 | 30 | 15;

/** Someone else in the call (one peer connection each — calls are a mesh). */
export type CallRemote = {
  userId: string;
  user: User | null;
  stream: MediaStream | null;
  /** What they are sending, as announced over signaling. */
  video: boolean;
  screen: boolean;
};

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  isGroup: boolean;
  /** The call was started as a video call (ringing UI and initial camera). */
  video: boolean;
  /** Direct calls: the other person. Incoming group calls: who is calling. */
  peer: User | null;
  title: string;
  answeredAt: number | null;
  micMuted: boolean;
  /** Local camera is off (true for voice calls until the user turns it on). */
  cameraOff: boolean;
  sharingScreen: boolean;
  speakerOn: boolean;
  frontCamera: boolean;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remotes: CallRemote[];
  /** Bumped when tracks inside a stream change, so video views re-render. */
  mediaVersion: number;
  /** Detected from WebRTC stats: our audio isn't leaving, or nobody's is arriving. */
  audioIssue: 'send' | 'receive' | null;
  /** Screen share also carries the shared tab/system audio. */
  sharingAudio: boolean;
  /** Noise cancellation currently applied to the mic. */
  noiseMode: NoiseMode;
  /** The call shrank to a floating window so the rest of the app can be used. */
  minimized: boolean;
  /** Temporary chat for this call only (never stored). */
  chat: CallChatMessage[];
  chatUnread: number;
  notice: string | null;
  reaction: { emoji: string; key: number } | null;
  /** Sender controls, changed from the in-call quality panel. */
  voiceBitrate: VoiceBitrate;
  streamQuality: StreamQuality;
  streamFps: StreamFps;
  /** True for a non-member admitted only for the lifetime of this group call. */
  guest: boolean;
  audioDevices: AudioDeviceChoice[];
  audioInputId: string;
  audioOutputId: string;
};

const IDLE: CallState = {
  phase: 'idle',
  callId: null,
  conversationId: null,
  isGroup: false,
  video: true,
  peer: null,
  title: '',
  answeredAt: null,
  micMuted: false,
  cameraOff: true,
  sharingScreen: false,
  speakerOn: false,
  frontCamera: true,
  localStream: null,
  screenStream: null,
  remotes: [],
  mediaVersion: 0,
  audioIssue: null,
  sharingAudio: false,
  noiseMode: 'standard',
  minimized: false,
  chat: [],
  chatUnread: 0,
  notice: null,
  reaction: null,
  voiceBitrate: 160,
  streamQuality: '1080p',
  streamFps: 30,
  guest: false,
  audioDevices: [],
  audioInputId: 'default',
  audioOutputId: 'default',
};

type CallApi = {
  call: CallState;
  startCall: (conversation: Conversation, video: boolean) => Promise<void>;
  /** Joins the call already running in a conversation (group calls). */
  joinCall: (conversationId: string) => Promise<void>;
  /** Joins a group call from a private temporary invitation. */
  joinInvitedCall: (callId: string) => Promise<void>;
  inviteGuests: (userIds: string[]) => Promise<User[]>;
  accept: (audioOnly?: boolean) => Promise<void>;
  decline: (quickReply?: string) => void;
  hangUp: () => void;
  toggleMic: () => void;
  /** Turns the camera on or off at any point of the call, including voice calls. */
  toggleCamera: () => Promise<void>;
  /** Starts or stops screen sharing at any point of the call (web/desktop). */
  toggleScreenShare: () => Promise<void>;
  toggleSpeaker: () => void;
  /** Switches the mic's noise cancellation live (off / standard / strong AI). */
  setNoiseMode: (mode: NoiseMode) => Promise<void>;
  flipCamera: () => void;
  setMinimized: (minimized: boolean) => void;
  sendReaction: (emoji: string) => void;
  sendChat: (text: string) => void;
  /** Marks the in-call chat as read (panel opened). */
  readChat: () => void;
  setVoiceBitrate: (bitrate: VoiceBitrate) => Promise<void>;
  setStreamQuality: (quality: StreamQuality) => Promise<void>;
  setStreamFps: (fps: StreamFps) => Promise<void>;
  refreshAudioDevices: () => Promise<void>;
  selectAudioInput: (deviceId: string) => Promise<void>;
  selectAudioOutput: (deviceId: string) => Promise<void>;
  /** Bumped when the call log should refresh (a call just finished). */
  historyVersion: number;
};

type Peer = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; offerer: boolean };

const CallContext = createContext<CallApi | null>(null);

const NATIVE_NOTICE = 'Audio/video needs the installed Flock app — Expo Go only supports call signaling.';

export const STREAM_PRESETS: Record<StreamQuality, { width: number; height: number; maxBitrate: number }> = {
  '2k': { width: 2560, height: 1440, maxBitrate: 8_000_000 },
  '1080p': { width: 1920, height: 1080, maxBitrate: 5_000_000 },
  '720p': { width: 1280, height: 720, maxBitrate: 2_500_000 },
  '480p': { width: 854, height: 480, maxBitrate: 1_200_000 },
};

const memberOf = (conversationId: string | null, userId: string) =>
  chatStore.state.conversations.find((c) => c.id === conversationId)?.members.find((m) => m.id === userId) ?? null;

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const connected = useChat((s) => s.connected);
  const [call, setCallState] = useState<CallState>(IDLE);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Mirror of `call` that event handlers can read synchronously.
  const callRef = useRef<CallState>(IDLE);
  const setCall = useCallback((next: CallState | ((c: CallState) => CallState)) => {
    callRef.current = typeof next === 'function' ? next(callRef.current) : next;
    setCallState(callRef.current);
  }, []);

  // One peer connection per other participant, keyed by user id.
  const peers = useRef(new Map<string, Peer>());
  // Signaling from each participant is handled strictly in order (offer before its candidates).
  const queues = useRef(new Map<string, Promise<void>>());
  const iceConfig = useRef<RTCConfiguration | null>(null);
  const acceptedHere = useRef(false);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const screenAudio = useRef<{ track: MediaStreamTrack; ctx: AudioContext; mixed: MediaStreamTrack; out: MediaStreamAudioDestinationNode; micInput: AudioNode } | null>(null);
  // Releases the current mic pipeline (raw track, plus the RNNoise graph in strong mode).
  const micDispose = useRef<(() => void) | null>(null);
  // Mic/camera may still be waiting on permission when the first offer arrives.
  const mediaReady = useRef<Promise<boolean> | null>(null);

  const patch = useCallback((p: Partial<CallState>) => setCall((c) => ({ ...c, ...p })), [setCall]);

  const upsertRemote = useCallback(
    (userId: string, p: Partial<CallRemote> = {}) =>
      setCall((c) => {
        const i = c.remotes.findIndex((r) => r.userId === userId);
        const remotes =
          i < 0
            ? [...c.remotes, { userId, user: memberOf(c.conversationId, userId), stream: null, video: false, screen: false, ...p }]
            : c.remotes.map((r, j) => (j === i ? { ...r, ...p } : r));
        return { ...c, remotes, mediaVersion: c.mediaVersion + 1 };
      }),
    [setCall],
  );

  const closePeer = useCallback(
    (userId: string) => {
      peers.current.get(userId)?.pc.close();
      peers.current.delete(userId);
      queues.current.delete(userId);
      setCall((c) => ({ ...c, remotes: c.remotes.filter((r) => r.userId !== userId), mediaVersion: c.mediaVersion + 1 }));
    },
    [setCall],
  );

  /** What we send: mic (or mic + shared screen audio), and screen > camera > nothing. */
  const outgoingAudio = useCallback(() => screenAudio.current?.mixed ?? callRef.current.localStream?.getAudioTracks()[0] ?? null, []);
  const outgoingVideo = useCallback(() => screenTrack.current ?? (!callRef.current.cameraOff ? cameraTrack.current : null), []);

  /** Swaps the track of one kind on every connection — no renegotiation needed. */
  const setSenders = useCallback(async (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
    const jobs: Promise<void>[] = [];
    for (const { pc } of peers.current.values()) {
      for (const tr of pc.getTransceivers()) {
        if (tr.receiver.track?.kind === kind && tr.sender.track !== track) jobs.push(tr.sender.replaceTrack(track).catch(() => {}));
      }
    }
    await Promise.all(jobs);
  }, []);

  /** Applies Opus and screen-share limits without renegotiating the call. */
  const applySenderQuality = useCallback(
    async (overrides: Partial<Pick<CallState, 'voiceBitrate' | 'streamQuality' | 'streamFps'>> = {}) => {
      const c = { ...callRef.current, ...overrides };
      const screen = !!screenTrack.current;
      const preset = STREAM_PRESETS[c.streamQuality];
      const screenSettings = screenTrack.current?.getSettings();
      const sourceLongEdge = Math.max(screenSettings?.width ?? 0, screenSettings?.height ?? 0);
      const targetLongEdge = Math.max(preset.width, preset.height);
      const jobs: Promise<void>[] = [];
      for (const { pc } of peers.current.values()) {
        for (const sender of pc.getSenders()) {
          const kind = sender.track?.kind;
          if (kind !== 'audio' && kind !== 'video') continue;
          const params: any = sender.getParameters();
          if (!params.encodings?.length) continue;
          for (const encoding of params.encodings) {
            if (kind === 'audio') encoding.maxBitrate = c.voiceBitrate * 1000;
            if (kind === 'video') {
              if (screen) {
                encoding.maxBitrate = preset.maxBitrate;
                encoding.maxFramerate = c.streamFps;
                if (Platform.OS === 'android' && sourceLongEdge) encoding.scaleResolutionDownBy = Math.max(1, sourceLongEdge / targetLongEdge);
                else delete encoding.scaleResolutionDownBy;
              } else {
                delete encoding.maxBitrate;
                delete encoding.maxFramerate;
                delete encoding.scaleResolutionDownBy;
              }
            }
          }
          jobs.push(sender.setParameters(params).catch(() => {}));
        }
      }
      await Promise.all(jobs);
    },
    [],
  );

  /** Stops mixing shared-screen audio and puts the plain mic back on the call. */
  const stopScreenAudio = useCallback(() => {
    const mix = screenAudio.current;
    if (!mix) return;
    screenAudio.current = null;
    setSenders('audio', callRef.current.localStream?.getAudioTracks()[0] ?? null);
    mix.track.stop();
    mix.mixed.stop();
    mix.ctx.close().catch(() => {});
  }, [setSenders]);

  const refreshAudioDevices = useCallback(async () => {
    const status = await callAudio.devices();
    setCall((current) => {
      const inputs = status.devices.filter((device) => device.kind === 'input');
      const outputs = status.devices.filter((device) => device.kind === 'output');
      const keepInput = inputs.some((device) => device.id === current.audioInputId);
      const keepOutput = outputs.some((device) => device.id === current.audioOutputId);
      return {
        ...current,
        audioDevices: status.devices,
        audioInputId: Platform.OS === 'web' && keepInput ? current.audioInputId : status.selectedInputId,
        audioOutputId: Platform.OS === 'web' && keepOutput ? current.audioOutputId : status.selectedOutputId,
        speakerOn: (Platform.OS === 'web' && keepOutput ? current.audioOutputId : status.selectedOutputId) === 'SPEAKER_PHONE',
      };
    });
  }, [setCall]);

  const cleanup = useCallback(() => {
    for (const { pc } of peers.current.values()) pc.close();
    peers.current.clear();
    queues.current.clear();
    acceptedHere.current = false;
    mediaReady.current = null;
    const { localStream } = callRef.current;
    localStream?.getTracks().forEach((t) => t.stop());
    cameraTrack.current?.stop();
    micDispose.current?.();
    micDispose.current = null;
    screenTrack.current?.stop();
    cameraTrack.current = null;
    screenTrack.current = null;
    stopScreenAudio();
    callAudio.stop();
    setCall(IDLE);
    setHistoryVersion((v) => v + 1);
  }, [setCall, stopScreenAudio]);

  /** Signaling to one participant, or to everyone else in the call when `to` is omitted. */
  const signal = useCallback((data: unknown, to?: string) => {
    const { callId } = callRef.current;
    if (callId) chatStore.socket?.emit('call:signal', { callId, to, data });
  }, []);

  /** Tells the others (or one newcomer) whether our video slot carries the camera or the screen. */
  const announceMedia = useCallback(
    (to?: string) => {
      const c = callRef.current;
      signal({ type: 'media', video: !!screenTrack.current || !c.cameraOff, screen: !!screenTrack.current }, to);
    },
    [signal],
  );

  const syncVideoSender = useCallback(async () => {
    await setSenders('video', outgoingVideo());
    await applySenderQuality();
    announceMedia();
  }, [setSenders, outgoingVideo, applySenderQuality, announceMedia]);

  /** Opens mic (and camera for video calls) once per call; false when media is unavailable. */
  const prepareMedia = useCallback(
    async (video: boolean) => {
      if (!rtcSupported()) {
        patch({ notice: t(NATIVE_NOTICE) });
        return false;
      }
      let stream: MediaStream;
      try {
        [stream, iceConfig.current] = await Promise.all([getLocalMedia(video, micConstraints(getNoisePreference())), loadIceConfig(api.ice)]);
      } catch (e: any) {
        patch({ notice: e.message });
        return false;
      }
      if (callRef.current.phase === 'idle') {
        // Hung up while the permission prompt was open.
        stream.getTracks().forEach((tr) => tr.stop());
        return false;
      }
      // Run the mic through the preferred noise cancellation before it is sent.
      const rawMic = stream.getAudioTracks()[0];
      let noiseMode = getNoisePreference();
      if (rawMic) {
        const chain = await processMic(rawMic, noiseMode);
        if (chain.track !== rawMic) {
          stream.removeTrack(rawMic);
          stream.addTrack(chain.track);
        } else if (noiseMode === 'strong') noiseMode = 'standard';
        micDispose.current = chain.dispose;
      }
      const cam = stream.getVideoTracks()[0] ?? null;
      cameraTrack.current = cam;
      patch({ localStream: stream, cameraOff: !cam, noiseMode });
      return true;
    },
    [patch],
  );

  /** A connection to one participant. The newcomer of the pair is the offerer. */
  const makePeer = useCallback(
    (userId: string, offerer: boolean) => {
      const local = callRef.current.localStream;
      if (!local || !iceConfig.current) return null;
      const pc = createPeer(
        iceConfig.current,
        (d) => signal(d, userId),
        (remote) => upsertRemote(userId, { stream: remote }),
      );
      const entry: Peer = { pc, pending: [], offerer };
      peers.current.set(userId, entry);
      pc.oniceconnectionstatechange = async () => {
        // Network changed (Wi-Fi ↔ mobile data…): the offerer renegotiates new ICE paths.
        if (pc.iceConnectionState === 'failed' && offerer && peers.current.get(userId)?.pc === pc) {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            signal({ type: 'offer', sdp: offer.sdp }, userId);
          } catch {}
        }
      };
      if (offerer) {
        // Always negotiate a video slot, so camera/screen can be added mid-call with replaceTrack().
        pc.addTransceiver(outgoingAudio() ?? 'audio', { direction: 'sendrecv', streams: [local] });
        pc.addTransceiver(outgoingVideo() ?? 'video', { direction: 'sendrecv', streams: [local] });
      }
      // Dev-only hooks for call diagnostics (e2e tests read WebRTC stats through them).
      if (__DEV__) {
        (globalThis as any).__flockPc = pc;
        (globalThis as any).__flockPeers = peers.current;
      }
      upsertRemote(userId);
      return entry;
    },
    [signal, upsertRemote, outgoingAudio, outgoingVideo],
  );

  const offerTo = useCallback(
    async (userId: string) => {
      const entry = peers.current.get(userId) ?? makePeer(userId, true);
      if (!entry) {
        upsertRemote(userId);
        return;
      }
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      await applySenderQuality();
      signal({ type: 'offer', sdp: offer.sdp }, userId);
    },
    [makePeer, signal, upsertRemote, applySenderQuality],
  );

  /** Becomes a participant: the server answers with who is already in, and we connect to each. */
  const join = useCallback(
    (callId: string) => {
      chatStore.socket?.emit('call:accept', { callId }, async (res: any) => {
        if (!res?.ok) {
          cleanup();
          return;
        }
        if (callRef.current.callId !== callId) return;
        patch({
          isGroup: !!res.isGroup,
          conversationId: res.conversationId ?? callRef.current.conversationId,
          title: res.title ?? callRef.current.title,
          guest: !!res.guest,
        });
        const ready = await mediaReady.current;
        for (const participant of (res.participants ?? []) as User[]) {
          upsertRemote(participant.id, { user: participant });
          if (ready) await offerTo(participant.id).catch((e) => console.warn('[flock] offer failed', e));
        }
      });
    },
    [cleanup, patch, offerTo, upsertRemote],
  );

  const handleSignal = useCallback(
    async (from: string, data: any) => {
      if (data?.type === 'reaction') {
        patch({ reaction: { emoji: data.emoji, key: Date.now() } });
        return;
      }
      if (data?.type === 'chat' && typeof data.text === 'string') {
        const author = callRef.current.isGroup
          ? memberOf(callRef.current.conversationId, from)?.displayName ?? callRef.current.remotes.find((r) => r.userId === from)?.user?.displayName
          : undefined;
        const msg: CallChatMessage = { id: String(data.id ?? Date.now()), mine: false, text: data.text.slice(0, 2000), at: Date.now(), author };
        setCall((c) => ({ ...c, chat: [...c.chat, msg], chatUnread: c.chatUnread + 1 }));
        return;
      }
      if (data?.type === 'media') {
        upsertRemote(from, { video: !!data.video, screen: !!data.screen });
        return;
      }
      if (data?.type === 'offer') {
        if (!(await mediaReady.current)) return;
        const entry = peers.current.get(from) ?? makePeer(from, false);
        if (!entry) return;
        const { pc } = entry;
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        // Send our mic and current video back on the slots the offer created.
        for (const tr of pc.getTransceivers()) {
          const kind = tr.receiver.track?.kind;
          if (kind !== 'audio' && kind !== 'video') continue;
          tr.direction = 'sendrecv';
          const track = kind === 'audio' ? outgoingAudio() : outgoingVideo();
          if (tr.sender.track !== track) await tr.sender.replaceTrack(track).catch(() => {});
        }
        for (const cand of entry.pending) await pc.addIceCandidate(cand).catch(() => {});
        entry.pending = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await applySenderQuality();
        signal({ type: 'answer', sdp: answer.sdp }, from);
        announceMedia(from);
        return;
      }
      const entry = peers.current.get(from);
      if (!entry) return;
      if (data?.type === 'answer') {
        await entry.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const cand of entry.pending) await entry.pc.addIceCandidate(cand).catch(() => {});
        entry.pending = [];
        announceMedia(from);
      } else if (data?.type === 'candidate') {
        if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(data.candidate).catch(() => {});
        else entry.pending.push(data.candidate);
      }
    },
    [patch, setCall, upsertRemote, makePeer, outgoingAudio, outgoingVideo, signal, announceMedia, applySenderQuality],
  );

  // ---------- socket events ----------

  useEffect(() => {
    const socket = chatStore.socket;
    if (!socket || !user) return;

    const toActive = () => {
      if (callRef.current.phase !== 'outgoing') return;
      callAudio.stopRingback();
      patch({ phase: 'active', answeredAt: Date.now() });
    };

    const onIncoming = (p: { callId: string; conversationId: string; video: boolean; caller: User; title: string; isGroup?: boolean }) => {
      if (callRef.current.phase !== 'idle') {
        if (callRef.current.callId !== p.callId) socket.emit('call:decline', { callId: p.callId });
        return;
      }
      setCall({
        ...IDLE,
        phase: 'incoming',
        callId: p.callId,
        conversationId: p.conversationId,
        isGroup: !!p.isGroup,
        video: p.video,
        peer: p.caller,
        title: p.title,
      });
      callAudio.startRingtone();
    };

    const onAccepted = ({ callId, by }: { callId: string; by: string }) => {
      if (callRef.current.callId !== callId) return;
      if (by === user.id) {
        // Answered on another of my devices.
        if (!acceptedHere.current) cleanup();
        return;
      }
      toActive();
    };

    const onJoined = ({ callId, userId, user: joinedUser }: { callId: string; userId: string; user?: User }) => {
      if (callRef.current.callId !== callId || userId === user.id) return;
      // Re-joined from another device: the old connection is dead, the new device will offer.
      if (peers.current.has(userId)) closePeer(userId);
      upsertRemote(userId, { user: joinedUser ?? memberOf(callRef.current.conversationId, userId) });
      toActive();
    };

    const onLeft = ({ callId, userId }: { callId: string; userId: string }) => {
      if (callRef.current.callId === callId) closePeer(userId);
    };

    const onRingStop = ({ callId }: { callId: string }) => {
      const c = callRef.current;
      if (c.callId === callId && c.phase === 'incoming') cleanup();
    };

    const onSignal = ({ callId, from, data }: { callId: string; from: string; data: any }) => {
      if (callRef.current.callId !== callId || !from) return;
      const next = (queues.current.get(from) ?? Promise.resolve())
        .then(() => handleSignal(from, data))
        .catch((e) => console.warn('[flock] call signal failed', e));
      queues.current.set(from, next);
    };

    const onEnded = ({ callId }: { callId: string }) => {
      if (callRef.current.callId === callId) cleanup();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:participant-joined', onJoined);
    socket.on('call:participant-left', onLeft);
    socket.on('call:ring-stop', onRingStop);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:participant-joined', onJoined);
      socket.off('call:participant-left', onLeft);
      socket.off('call:ring-stop', onRingStop);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
    };
  }, [user, connected, cleanup, patch, setCall, closePeer, upsertRemote, handleSignal]);

  // Watch real audio flow: video can work while audio silently doesn't (muted device, blocked playback…).
  useEffect(() => {
    if (call.phase !== 'active') return;
    let lastSent = -1;
    let lastReceived = -1;
    let stuckSend = 0;
    let stuckReceive = 0;
    const id = setInterval(async () => {
      const live = [...peers.current.values()].filter(({ pc }) => ['connected', 'completed'].includes(pc.iceConnectionState));
      if (!live.length) return;
      let sent = 0;
      let received = 0;
      try {
        for (const { pc } of live) {
          const stats = await pc.getStats();
          stats.forEach((r: any) => {
            const kind = r.kind ?? r.mediaType;
            if (r.type === 'outbound-rtp' && kind === 'audio') sent += r.bytesSent ?? 0;
            if (r.type === 'inbound-rtp' && kind === 'audio') received += r.bytesReceived ?? 0;
          });
        }
      } catch {
        return;
      }
      // Someone joining or leaving changes the totals: start counting again.
      if (sent < lastSent || received < lastReceived) lastSent = lastReceived = -1;
      stuckSend = lastSent >= 0 && sent <= lastSent && !callRef.current.micMuted ? stuckSend + 1 : 0;
      stuckReceive = lastReceived >= 0 && received <= lastReceived ? stuckReceive + 1 : 0;
      lastSent = sent;
      lastReceived = received;
      const issue = stuckSend >= 3 ? 'send' : stuckReceive >= 3 ? 'receive' : null;
      if (issue !== callRef.current.audioIssue) {
        if (issue) console.warn('[flock] call audio problem:', issue, { sent, received });
        patch({ audioIssue: issue });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [call.phase, patch]);

  // Keep the in-call picker synchronized when a headset, AirPods, USB mic or
  // browser audio device is connected/disconnected.
  useEffect(() => {
    if (call.phase !== 'active') return;
    void refreshAudioDevices();
    return callAudio.watchDevices(() => void refreshAudioDevices());
  }, [call.phase, refreshAudioDevices]);

  // Closing/reloading the tab ends the call right away (the server also ends it when the socket drops).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onLeave = () => {
      const c = callRef.current;
      if (c.phase === 'idle' || !c.callId) return;
      chatStore.socket?.emit(c.phase === 'incoming' ? 'call:decline' : 'call:end', { callId: c.callId });
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, []);

  // Hang up if the user signs out mid-call.
  useEffect(() => {
    if (!user && callRef.current.phase !== 'idle') cleanup();
  }, [user, cleanup]);

  // ---------- actions ----------

  const accept = useCallback(
    async (audioOnly?: boolean) => {
      const c = callRef.current;
      if (c.phase !== 'incoming' || !c.callId) return;
      acceptedHere.current = true;
      const video = c.video && !audioOnly;
      patch({ phase: 'active', answeredAt: Date.now(), video, speakerOn: video });
      await callAudio.prepare();
      callAudio.start(video);
      mediaReady.current = prepareMedia(video);
      await mediaReady.current;
      if (callRef.current.callId === c.callId) join(c.callId);
    },
    [patch, prepareMedia, join],
  );

  const joinCall = useCallback(
    async (conversationId: string) => {
      const running = chatStore.state.activeCalls[conversationId];
      const conversation = chatStore.state.conversations.find((c) => c.id === conversationId);
      if (!running || !conversation || callRef.current.phase !== 'idle') return;
      setCall({
        ...IDLE,
        phase: 'incoming',
        callId: running.callId,
        conversationId,
        isGroup: conversation.type === 'group',
        video: running.video,
        peer: conversation.type === 'direct' ? (conversation.members.find((m) => m.id !== user?.id) ?? null) : null,
        title: conversation.name,
      });
      // Join with the camera off; it can be turned on from the dock.
      await accept(true);
    },
    [setCall, accept, user],
  );

  const joinInvitedCall = useCallback(
    async (callId: string) => {
      if (callRef.current.phase !== 'idle') return;
      const running = await api.invitedCall(callId);
      setCall({
        ...IDLE,
        phase: 'incoming',
        callId,
        conversationId: running.conversationId,
        isGroup: true,
        video: running.video,
        title: running.title ?? t('Group call'),
        guest: true,
      });
      await accept(true);
    },
    [accept, setCall],
  );

  const inviteGuests = useCallback(async (userIds: string[]) => {
    const callId = callRef.current.callId;
    if (!callId || !chatStore.socket || !userIds.length) return [];
    return new Promise<User[]>((resolve, reject) => {
      chatStore.socket?.emit('call:invite-guests', { callId, userIds }, (res: any) => {
        if (!res?.ok) reject(new Error(t(res?.error || 'Could not send invitation')));
        else resolve((res.invited ?? []) as User[]);
      });
    });
  }, []);

  const startCall = useCallback(
    async (conversation: Conversation, video: boolean) => {
      if (callRef.current.phase !== 'idle' || !chatStore.socket) return;
      if (chatStore.state.activeCalls[conversation.id]) return joinCall(conversation.id);
      const isGroup = conversation.type === 'group';
      const peer = isGroup ? null : (conversation.members.find((m) => m.id !== user?.id) ?? null);
      setCall({ ...IDLE, phase: 'outgoing', conversationId: conversation.id, isGroup, video, peer, title: conversation.name, speakerOn: video });
      await callAudio.prepare();
      callAudio.start(video);
      callAudio.startRingback();
      mediaReady.current = prepareMedia(video);
      chatStore.socket.emit('call:invite', { conversationId: conversation.id, video }, async (res: any) => {
        if (!res?.ok) {
          cleanup();
          return;
        }
        patch({ callId: res.callId });
        if (res.alreadyRunning) {
          // Someone started a call here at the same moment: join theirs instead.
          acceptedHere.current = true;
          callAudio.stopRingback();
          patch({ phase: 'active', answeredAt: Date.now() });
          await mediaReady.current;
          if (callRef.current.callId === res.callId) join(res.callId);
        }
      });
      await mediaReady.current;
    },
    [user, cleanup, patch, prepareMedia, setCall, joinCall, join],
  );

  const decline = useCallback(
    (quickReply?: string) => {
      const c = callRef.current;
      if (c.callId) chatStore.socket?.emit('call:decline', { callId: c.callId });
      if (quickReply && c.conversationId) chatStore.send(c.conversationId, quickReply);
      cleanup();
    },
    [cleanup],
  );

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (c.callId) chatStore.socket?.emit('call:end', { callId: c.callId });
    cleanup();
  }, [cleanup]);

  const replaceMicrophone = useCallback(
    async (mode: NoiseMode, deviceId = callRef.current.audioInputId) => {
      const c = callRef.current;
      if (mode === 'strong' && !strongNoiseSupported()) mode = 'standard';
      if (!c.localStream) return;
      let raw: MediaStreamTrack;
      try {
        const base = micConstraints(mode);
        const constraints = Platform.OS === 'web' && deviceId && deviceId !== 'default' ? { ...base, deviceId: { exact: deviceId } } : base;
        raw = (await navigator.mediaDevices.getUserMedia({ audio: constraints })).getAudioTracks()[0]!;
      } catch {
        patch({ notice: t('The selected microphone is unavailable') });
        return;
      }
      const chain = await processMic(raw, mode);
      const applied: NoiseMode = mode === 'strong' && chain.track === raw ? 'standard' : mode;
      chain.track.enabled = !c.micMuted;
      raw.enabled = !c.micMuted;
      // Swap the mic everywhere it is used: the live screen-audio mix, or the call's audio senders.
      const mix = screenAudio.current;
      if (mix) {
        const input = mix.ctx.createMediaStreamSource(new MediaStream([chain.track]));
        input.connect(mix.out);
        mix.micInput.disconnect();
        mix.micInput = input;
      } else {
        await setSenders('audio', chain.track);
      }
      const old = c.localStream.getAudioTracks()[0];
      if (old) c.localStream.removeTrack(old);
      c.localStream.addTrack(chain.track);
      micDispose.current?.();
      micDispose.current = chain.dispose;
      setCall((s) => ({ ...s, noiseMode: applied, audioInputId: deviceId || 'default', notice: null, mediaVersion: s.mediaVersion + 1 }));
    },
    [patch, setCall, setSenders],
  );

  const setNoiseMode = useCallback((mode: NoiseMode) => replaceMicrophone(mode), [replaceMicrophone]);

  const selectAudioInput = useCallback(
    async (deviceId: string) => {
      if (Platform.OS === 'web') {
        await replaceMicrophone(callRef.current.noiseMode, deviceId);
        await refreshAudioDevices();
        return;
      }
      await callAudio.selectRoute(deviceId);
      await refreshAudioDevices();
    },
    [refreshAudioDevices, replaceMicrophone],
  );

  const selectAudioOutput = useCallback(
    async (deviceId: string) => {
      if (Platform.OS === 'web') {
        patch({ audioOutputId: deviceId });
        return;
      }
      await callAudio.selectRoute(deviceId);
      await refreshAudioDevices();
    },
    [patch, refreshAudioDevices],
  );

  const toggleMic = useCallback(() => {
    const c = callRef.current;
    const muted = !c.micMuted;
    c.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    patch({ micMuted: muted });
  }, [patch]);

  const toggleCamera = useCallback(async () => {
    const c = callRef.current;
    if (!c.localStream) {
      if (!rtcSupported()) patch({ notice: t(NATIVE_NOTICE) });
      return;
    }
    if (!c.cameraOff) {
      // Release the camera entirely (its light goes off), not just mute it.
      const cam = cameraTrack.current;
      cameraTrack.current = null;
      if (cam) {
        c.localStream.removeTrack(cam);
        cam.stop();
      }
      setCall((s) => ({ ...s, cameraOff: true, mediaVersion: s.mediaVersion + 1 }));
      await syncVideoSender();
      return;
    }
    try {
      const cam = await getCameraTrack();
      cameraTrack.current = cam;
      c.localStream.addTrack(cam);
      setCall((s) => ({ ...s, cameraOff: false, frontCamera: true, notice: null, mediaVersion: s.mediaVersion + 1 }));
      await syncVideoSender();
    } catch (e: any) {
      patch({ notice: e.message });
    }
  }, [patch, setCall, syncVideoSender]);

  const toggleScreenShare = useCallback(async () => {
    if (!callRef.current.localStream) return;
    if (screenTrack.current) {
      const t = screenTrack.current;
      screenTrack.current = null;
      t.stop();
      stopScreenAudio();
      patch({ sharingScreen: false, sharingAudio: false, screenStream: null });
      await syncVideoSender();
      return;
    }
    try {
      const preset = STREAM_PRESETS[callRef.current.streamQuality];
      const fps = callRef.current.streamFps;
      let display: MediaStream;
      if (Platform.OS === 'android') {
        const screen = Dimensions.get('screen');
        const physicalLongEdge = Math.max(screen.width, screen.height) * PixelRatio.get();
        // Capture up to 2K once; sender scaling applies the live 1080p/720p/480p choice
        // without showing Android's MediaProjection permission dialog again.
        const resolutionScale = Math.min(1, Math.max(STREAM_PRESETS['2k'].width, STREAM_PRESETS['2k'].height) / physicalLongEdge);
        display = await (navigator.mediaDevices as any).getDisplayMedia({
          android: { createConfigForDefaultDisplay: true, resolutionScale },
        });
      } else {
        // Asking for audio makes the browser offer "Share tab/system audio" in its own picker (like Google Meet).
        display = await (navigator.mediaDevices as any).getDisplayMedia({
          video: {
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: fps, max: fps },
          },
          // restrictOwnAudio keeps Flock's own playback (the other callers' voices) out of captured
          // system audio — otherwise they hear themselves echoed back.
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
        });
      }
      const track = display.getVideoTracks()[0]!;
      if ('contentHint' in track) track.contentHint = 'detail';
      screenTrack.current = track;
      // The browser's own "Stop sharing" button ends the track.
      track.onended = () => {
        if (screenTrack.current !== track) return;
        screenTrack.current = null;
        stopScreenAudio();
        patch({ sharingScreen: false, sharingAudio: false, screenStream: null });
        syncVideoSender();
      };

      // Mix the shared audio with the mic into the existing audio senders — no renegotiation.
      let shared: MediaStreamTrack | undefined = Platform.OS === 'web' ? display.getAudioTracks()[0] : undefined;
      let notice: string | null = null;
      const surface = (track.getSettings() as { displaySurface?: string }).displaySurface;
      const ownAudioExcluded = (shared?.getSettings() as { restrictOwnAudio?: boolean } | undefined)?.restrictOwnAudio === true;
      if (shared && surface === 'monitor' && !ownAudioExcluded) {
        // This browser can't remove the call from system audio: sharing it would echo the other
        // callers' voices back to them, so share the screen without sound.
        shared.stop();
        shared = undefined;
        notice = t("Your browser can't keep the call out of system audio, so the screen is shared without sound. Share a tab to include its audio.");
      }
      const mic = callRef.current.localStream?.getAudioTracks()[0];
      let withAudio = false;
      if (shared && mic) {
        const ctx = new AudioContext();
        const out = ctx.createMediaStreamDestination();
        const micInput = ctx.createMediaStreamSource(new MediaStream([mic]));
        micInput.connect(out);
        ctx.createMediaStreamSource(new MediaStream([shared])).connect(out);
        const mixed = out.stream.getAudioTracks()[0]!;
        screenAudio.current = { track: shared, ctx, mixed, out, micInput };
        await setSenders('audio', mixed);
        withAudio = true;
      }
      patch({ sharingScreen: true, sharingAudio: withAudio, screenStream: new MediaStream([track]), notice });
      await syncVideoSender();
    } catch {
      // User cancelled the picker.
    }
  }, [patch, syncVideoSender, setSenders, stopScreenAudio]);

  const setVoiceBitrate = useCallback(
    async (voiceBitrate: VoiceBitrate) => {
      patch({ voiceBitrate });
      await applySenderQuality({ voiceBitrate });
    },
    [applySenderQuality, patch],
  );

  const setStreamQuality = useCallback(
    async (streamQuality: StreamQuality) => {
      patch({ streamQuality });
      const track = screenTrack.current;
      if (Platform.OS === 'web' && track) {
        const preset = STREAM_PRESETS[streamQuality];
        await track
          .applyConstraints({ width: { ideal: preset.width, max: preset.width }, height: { ideal: preset.height, max: preset.height } })
          .catch(() => {});
      }
      await applySenderQuality({ streamQuality });
    },
    [applySenderQuality, patch],
  );

  const setStreamFps = useCallback(
    async (streamFps: StreamFps) => {
      patch({ streamFps });
      if (Platform.OS === 'web' && screenTrack.current) {
        await screenTrack.current.applyConstraints({ frameRate: { ideal: streamFps, max: streamFps } }).catch(() => {});
      }
      await applySenderQuality({ streamFps });
    },
    [applySenderQuality, patch],
  );

  const toggleSpeaker = useCallback(() => {
    void selectAudioOutput(callRef.current.speakerOn ? 'AUTOMATIC' : 'SPEAKER_PHONE');
  }, [selectAudioOutput]);

  const flipCamera = useCallback(() => {
    if (Platform.OS === 'web') return;
    const c = callRef.current;
    switchCamera(c.localStream);
    patch({ frontCamera: !c.frontCamera });
  }, [patch]);

  const setMinimized = useCallback((minimized: boolean) => patch({ minimized }), [patch]);

  const sendReaction = useCallback(
    (emoji: string) => {
      signal({ type: 'reaction', emoji });
      patch({ reaction: { emoji, key: Date.now() } });
    },
    [signal, patch],
  );

  const sendChat = useCallback(
    (text: string) => {
      const body = text.trim().slice(0, 2000);
      if (!body) return;
      const msg: CallChatMessage = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, mine: true, text: body, at: Date.now() };
      signal({ type: 'chat', id: msg.id, text: body });
      setCall((c) => ({ ...c, chat: [...c.chat, msg] }));
    },
    [signal, setCall],
  );

  const readChat = useCallback(() => patch({ chatUnread: 0 }), [patch]);

  const value = useMemo<CallApi>(
    () => ({
      call,
      startCall,
      joinCall,
      joinInvitedCall,
      inviteGuests,
      accept,
      decline,
      hangUp,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
      toggleSpeaker,
      setNoiseMode,
      flipCamera,
      setMinimized,
      sendReaction,
      sendChat,
      readChat,
      setVoiceBitrate,
      setStreamQuality,
      setStreamFps,
      refreshAudioDevices,
      selectAudioInput,
      selectAudioOutput,
      historyVersion,
    }),
    [
      call,
      startCall,
      joinCall,
      joinInvitedCall,
      inviteGuests,
      accept,
      decline,
      hangUp,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
      toggleSpeaker,
      setNoiseMode,
      flipCamera,
      setMinimized,
      sendReaction,
      sendChat,
      readChat,
      setVoiceBitrate,
      setStreamQuality,
      setStreamFps,
      refreshAudioDevices,
      selectAudioInput,
      selectAudioOutput,
      historyVersion,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}
