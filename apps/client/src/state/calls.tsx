import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { callAudio, switchCamera } from '@/lib/native-media';
import { api } from '@/lib/api';
import { getNoisePreference, micConstraints, processMic, strongNoiseSupported, type NoiseMode } from '@/lib/noise';
import { createPeer, getCameraTrack, getLocalMedia, loadIceServers, rtcSupported, videoTransceiver } from '@/lib/rtc';
import type { Conversation, User } from '@/lib/types';
import { useAuth } from './auth';
import { chatStore, useChat } from './chat-store';
import { t } from '@/lib/i18n';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active';

export type CallChatMessage = { id: string; mine: boolean; text: string; at: number };

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  /** The call was started as a video call (ringing UI and initial camera). */
  video: boolean;
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
  remoteStream: MediaStream | null;
  /** What the other side is currently sending, as announced over signaling. */
  remoteVideo: boolean;
  remoteScreen: boolean;
  /** Bumped when tracks inside a stream change, so video views re-render. */
  mediaVersion: number;
  /** Detected from WebRTC stats: our audio isn't leaving, or theirs isn't arriving. */
  audioIssue: 'send' | 'receive' | null;
  /** Screen share also carries the shared tab/system audio. */
  sharingAudio: boolean;
  /** Noise cancellation currently applied to the mic. */
  noiseMode: NoiseMode;
  /** Temporary chat for this call only (never stored). */
  chat: CallChatMessage[];
  chatUnread: number;
  notice: string | null;
  reaction: { emoji: string; key: number } | null;
};

const IDLE: CallState = {
  phase: 'idle',
  callId: null,
  conversationId: null,
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
  remoteStream: null,
  remoteVideo: false,
  remoteScreen: false,
  mediaVersion: 0,
  audioIssue: null,
  sharingAudio: false,
  noiseMode: 'standard',
  chat: [],
  chatUnread: 0,
  notice: null,
  reaction: null,
};

type CallApi = {
  call: CallState;
  startCall: (conversation: Conversation, video: boolean) => Promise<void>;
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
  sendReaction: (emoji: string) => void;
  sendChat: (text: string) => void;
  /** Marks the in-call chat as read (panel opened). */
  readChat: () => void;
  /** Bumped when the call log should refresh (a call just finished). */
  historyVersion: number;
};

const CallContext = createContext<CallApi | null>(null);

const NATIVE_NOTICE = 'Audio/video needs the installed Flock app — Expo Go only supports call signaling.';

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const acceptedHere = useRef(false);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const screenAudio = useRef<{ track: MediaStreamTrack; ctx: AudioContext; mixed: MediaStreamTrack; out: MediaStreamAudioDestinationNode; micInput: AudioNode } | null>(null);
  // Releases the current mic pipeline (raw track, plus the RNNoise graph in strong mode).
  const micDispose = useRef<(() => void) | null>(null);
  // The caller's peer may still be waiting on mic/camera permission when the callee answers.
  const peerReady = useRef<Promise<RTCPeerConnection | null> | null>(null);

  const patch = useCallback((p: Partial<CallState>) => setCall((c) => ({ ...c, ...p })), [setCall]);

  /** The audio sender (mic, or mic + shared screen audio while sharing). */
  const audioSender = useCallback(
    () => pcRef.current?.getTransceivers().find((t) => t.receiver.track?.kind === 'audio')?.sender ?? null,
    [],
  );

  /** Stops mixing shared-screen audio and puts the plain mic back on the call. */
  const stopScreenAudio = useCallback(() => {
    const mix = screenAudio.current;
    if (!mix) return;
    screenAudio.current = null;
    const mic = callRef.current.localStream?.getAudioTracks()[0] ?? null;
    audioSender()?.replaceTrack(mic).catch(() => {});
    mix.track.stop();
    mix.mixed.stop();
    mix.ctx.close().catch(() => {});
  }, [audioSender]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    acceptedHere.current = false;
    peerReady.current = null;
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

  const signal = useCallback((data: unknown) => {
    const { callId } = callRef.current;
    if (callId) chatStore.socket?.emit('call:signal', { callId, data });
  }, []);

  /** Tells the other side whether our video slot carries the camera or the screen. */
  const announceMedia = useCallback(() => {
    const c = callRef.current;
    signal({ type: 'media', video: !!screenTrack.current || !c.cameraOff, screen: !!screenTrack.current });
  }, [signal]);

  /** Puts the right track in the video slot: screen > camera > nothing. */
  const syncVideoSender = useCallback(async () => {
    const pc = pcRef.current;
    const t = pc && videoTransceiver(pc);
    if (!t) return;
    const c = callRef.current;
    const track = screenTrack.current ?? (!c.cameraOff ? cameraTrack.current : null);
    await t.sender.replaceTrack(track);
    announceMedia();
  }, [announceMedia]);

  const preparePeer = useCallback(
    async (video: boolean, isCaller: boolean) => {
      if (!rtcSupported()) {
        patch({ notice: t(NATIVE_NOTICE) });
        return null;
      }
      let stream: MediaStream;
      let iceServers: RTCIceServer[];
      try {
        [stream, iceServers] = await Promise.all([getLocalMedia(video, micConstraints(getNoisePreference())), loadIceServers(api.ice)]);
      } catch (e: any) {
        patch({ notice: e.message });
        return null;
      }
      const pc = createPeer(iceServers, signal, (remote) =>
        setCall((c) => ({ ...c, remoteStream: remote, mediaVersion: c.mediaVersion + 1 })),
      );
      pc.oniceconnectionstatechange = async () => {
        // Network changed (Wi-Fi ↔ mobile data…): the caller renegotiates new ICE paths.
        if (pc.iceConnectionState === 'failed' && isCaller && pcRef.current === pc) {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            signal({ type: 'offer', sdp: offer.sdp });
          } catch {}
        }
      };
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
      patch({ noiseMode });
      stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
      const cam = stream.getVideoTracks()[0] ?? null;
      cameraTrack.current = cam;
      if (cam) pc.addTrack(cam, stream);
      // Voice calls still negotiate a video slot so camera/screen can be added mid-call
      // with replaceTrack() — no renegotiation needed. The callee gets it from the offer.
      else if (isCaller) pc.addTransceiver('video', { direction: 'sendrecv', streams: [stream] });
      pcRef.current = pc;
      // Dev-only hook for call diagnostics (e2e tests read WebRTC stats through it).
      if (__DEV__) (globalThis as any).__flockPc = pc;
      patch({ localStream: stream, cameraOff: !cam });
      return pc;
    },
    [patch, signal, setCall],
  );

  // ---------- socket events ----------

  useEffect(() => {
    const socket = chatStore.socket;
    if (!socket || !user) return;

    const onIncoming = (p: { callId: string; conversationId: string; video: boolean; caller: User; title: string }) => {
      if (callRef.current.phase !== 'idle') {
        socket.emit('call:decline', { callId: p.callId });
        return;
      }
      setCall({ ...IDLE, phase: 'incoming', callId: p.callId, conversationId: p.conversationId, video: p.video, peer: p.caller, title: p.title });
      callAudio.startRingtone();
    };

    const onAccepted = async ({ callId, by }: { callId: string; by: string }) => {
      const c = callRef.current;
      if (c.callId !== callId) return;
      if (by === user.id) {
        // Answered on another of my devices.
        if (!acceptedHere.current) cleanup();
        return;
      }
      if (c.phase !== 'outgoing') return;
      callAudio.stopRingback();
      patch({ phase: 'active', answeredAt: Date.now() });
      // If our mic/camera prompt is still open, wait for the peer instead of never sending the offer.
      const pc = pcRef.current ?? (await peerReady.current);
      if (pc && callRef.current.callId === callId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal({ type: 'offer', sdp: offer.sdp });
      }
    };

    const onSignal = async ({ callId, data }: { callId: string; data: any }) => {
      if (callRef.current.callId !== callId) return;
      if (data?.type === 'reaction') {
        patch({ reaction: { emoji: data.emoji, key: Date.now() } });
        return;
      }
      if (data?.type === 'chat' && typeof data.text === 'string') {
        const msg: CallChatMessage = { id: String(data.id ?? Date.now()), mine: false, text: data.text.slice(0, 2000), at: Date.now() };
        setCall((c) => ({ ...c, chat: [...c.chat, msg], chatUnread: c.chatUnread + 1 }));
        return;
      }
      if (data?.type === 'media') {
        setCall((c) => ({ ...c, remoteVideo: !!data.video, remoteScreen: !!data.screen, mediaVersion: c.mediaVersion + 1 }));
        return;
      }
      const pc = pcRef.current;
      if (!pc) return;
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        // Make our side of the video slot sendable too, then fill it if the camera is on.
        const t = videoTransceiver(pc);
        if (t) {
          t.direction = 'sendrecv';
          if (cameraTrack.current && !t.sender.track) await t.sender.replaceTrack(cameraTrack.current);
        }
        for (const cand of pendingCandidates.current) await pc.addIceCandidate(cand).catch(() => {});
        pendingCandidates.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ type: 'answer', sdp: answer.sdp });
        announceMedia();
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const cand of pendingCandidates.current) await pc.addIceCandidate(cand).catch(() => {});
        pendingCandidates.current = [];
        announceMedia();
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else pendingCandidates.current.push(data.candidate);
      }
    };

    const onEnded = ({ callId }: { callId: string }) => {
      if (callRef.current.callId === callId) cleanup();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
    };
  }, [user, connected, cleanup, patch, signal, setCall, announceMedia]);

  // Watch real audio flow: video can work while audio silently doesn't (muted device, blocked playback…).
  useEffect(() => {
    if (call.phase !== 'active') return;
    let lastSent = -1;
    let lastReceived = -1;
    let stuckSend = 0;
    let stuckReceive = 0;
    const id = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || !['connected', 'completed'].includes(pc.iceConnectionState)) return;
      let sent = 0;
      let received = 0;
      try {
        const stats = await pc.getStats();
        stats.forEach((r: any) => {
          const kind = r.kind ?? r.mediaType;
          if (r.type === 'outbound-rtp' && kind === 'audio') sent += r.bytesSent ?? 0;
          if (r.type === 'inbound-rtp' && kind === 'audio') received += r.bytesReceived ?? 0;
        });
      } catch {
        return;
      }
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

  const startCall = useCallback(
    async (conversation: Conversation, video: boolean) => {
      if (callRef.current.phase !== 'idle' || !chatStore.socket) return;
      const peer = conversation.members.find((m) => m.id !== user?.id) ?? null;
      setCall({ ...IDLE, phase: 'outgoing', conversationId: conversation.id, video, peer, title: conversation.name, speakerOn: video });
      callAudio.start(video);
      callAudio.startRingback();
      chatStore.socket.emit('call:invite', { conversationId: conversation.id, video }, (res: any) => {
        if (!res?.ok) {
          cleanup();
          return;
        }
        patch({ callId: res.callId });
      });
      peerReady.current = preparePeer(video, true);
      await peerReady.current;
    },
    [user, cleanup, patch, preparePeer, setCall],
  );

  const accept = useCallback(
    async (audioOnly?: boolean) => {
      const c = callRef.current;
      if (c.phase !== 'incoming' || !c.callId) return;
      acceptedHere.current = true;
      const video = c.video && !audioOnly;
      patch({ phase: 'active', answeredAt: Date.now(), video, speakerOn: video });
      callAudio.start(video);
      await preparePeer(video, false);
      chatStore.socket?.emit('call:accept', { callId: c.callId }, (res: any) => {
        if (!res?.ok) cleanup();
      });
    },
    [patch, preparePeer, cleanup],
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

  const setNoiseMode = useCallback(
    async (mode: NoiseMode) => {
      const c = callRef.current;
      if (mode === 'strong' && !strongNoiseSupported()) mode = 'standard';
      if (!c.localStream || !pcRef.current) return;
      let raw: MediaStreamTrack;
      try {
        raw = (await navigator.mediaDevices.getUserMedia({ audio: micConstraints(mode) })).getAudioTracks()[0]!;
      } catch {
        patch({ notice: t('Microphone access was blocked') });
        return;
      }
      const chain = await processMic(raw, mode);
      const applied: NoiseMode = mode === 'strong' && chain.track === raw ? 'standard' : mode;
      chain.track.enabled = !c.micMuted;
      raw.enabled = !c.micMuted;
      // Swap the mic everywhere it is used: the live screen-audio mix, or the call's audio sender.
      const mix = screenAudio.current;
      if (mix) {
        const input = mix.ctx.createMediaStreamSource(new MediaStream([chain.track]));
        input.connect(mix.out);
        mix.micInput.disconnect();
        mix.micInput = input;
      } else {
        await audioSender()?.replaceTrack(chain.track);
      }
      const old = c.localStream.getAudioTracks()[0];
      if (old) c.localStream.removeTrack(old);
      c.localStream.addTrack(chain.track);
      micDispose.current?.();
      micDispose.current = chain.dispose;
      setCall((s) => ({ ...s, noiseMode: applied, mediaVersion: s.mediaVersion + 1 }));
    },
    [patch, setCall, audioSender],
  );

  const toggleMic = useCallback(() => {
    const c = callRef.current;
    const muted = !c.micMuted;
    c.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    patch({ micMuted: muted });
  }, [patch]);

  const toggleCamera = useCallback(async () => {
    const c = callRef.current;
    if (!pcRef.current || !c.localStream) {
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
      if (!c.speakerOn) {
        callAudio.setSpeaker(true);
        patch({ speakerOn: true });
      }
      await syncVideoSender();
    } catch (e: any) {
      patch({ notice: e.message });
    }
  }, [patch, setCall, syncVideoSender]);

  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current) return;
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
      // Asking for audio makes the browser offer "Share tab/system audio" in its own picker (like Google Meet).
      const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        // restrictOwnAudio keeps Flock's own playback (the other caller's voice) out of captured
        // system audio — otherwise they hear themselves echoed back.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      const track = display.getVideoTracks()[0]!;
      screenTrack.current = track;
      // The browser's own "Stop sharing" button ends the track.
      track.onended = () => {
        if (screenTrack.current !== track) return;
        screenTrack.current = null;
        stopScreenAudio();
        patch({ sharingScreen: false, sharingAudio: false, screenStream: null });
        syncVideoSender();
      };

      // Mix the shared audio with the mic into the existing audio sender — no renegotiation.
      let shared: MediaStreamTrack | undefined = display.getAudioTracks()[0];
      let notice: string | null = null;
      const surface = (track.getSettings() as { displaySurface?: string }).displaySurface;
      const ownAudioExcluded = (shared?.getSettings() as { restrictOwnAudio?: boolean } | undefined)?.restrictOwnAudio === true;
      if (shared && surface === 'monitor' && !ownAudioExcluded) {
        // This browser can't remove the call from system audio: sharing it would echo the other
        // person's voice back to them, so share the screen without sound.
        shared.stop();
        shared = undefined;
        notice = t("Your browser can't keep the call out of system audio, so the screen is shared without sound. Share a tab to include its audio.");
      }
      const mic = callRef.current.localStream?.getAudioTracks()[0];
      const sender = audioSender();
      let withAudio = false;
      if (shared && mic && sender) {
        const ctx = new AudioContext();
        const out = ctx.createMediaStreamDestination();
        const micInput = ctx.createMediaStreamSource(new MediaStream([mic]));
        micInput.connect(out);
        ctx.createMediaStreamSource(new MediaStream([shared])).connect(out);
        const mixed = out.stream.getAudioTracks()[0]!;
        screenAudio.current = { track: shared, ctx, mixed, out, micInput };
        await sender.replaceTrack(mixed);
        withAudio = true;
      }
      patch({ sharingScreen: true, sharingAudio: withAudio, screenStream: new MediaStream([track]), notice });
      await syncVideoSender();
    } catch {
      // User cancelled the picker.
    }
  }, [patch, syncVideoSender, audioSender, stopScreenAudio]);

  const toggleSpeaker = useCallback(() => {
    const on = !callRef.current.speakerOn;
    callAudio.setSpeaker(on);
    patch({ speakerOn: on });
  }, [patch]);

  const flipCamera = useCallback(() => {
    if (Platform.OS === 'web') return;
    const c = callRef.current;
    switchCamera(c.localStream);
    patch({ frontCamera: !c.frontCamera });
  }, [patch]);

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
      accept,
      decline,
      hangUp,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
      toggleSpeaker,
      setNoiseMode,
      flipCamera,
      sendReaction,
      sendChat,
      readChat,
      historyVersion,
    }),
    [call, startCall, accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, toggleSpeaker, setNoiseMode, flipCamera, sendReaction, sendChat, readChat, historyVersion],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}
