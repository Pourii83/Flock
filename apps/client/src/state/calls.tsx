import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { callAudio, switchCamera } from '@/lib/native-media';
import { api } from '@/lib/api';
import { createPeer, getCameraTrack, getLocalMedia, loadIceServers, rtcSupported, videoTransceiver } from '@/lib/rtc';
import type { Conversation, User } from '@/lib/types';
import { useAuth } from './auth';
import { chatStore, useChat } from './chat-store';
import { t } from '@/lib/i18n';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active';

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
  flipCamera: () => void;
  sendReaction: (emoji: string) => void;
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

  const patch = useCallback((p: Partial<CallState>) => setCall((c) => ({ ...c, ...p })), [setCall]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    acceptedHere.current = false;
    const { localStream } = callRef.current;
    localStream?.getTracks().forEach((t) => t.stop());
    cameraTrack.current?.stop();
    screenTrack.current?.stop();
    cameraTrack.current = null;
    screenTrack.current = null;
    callAudio.stop();
    setCall(IDLE);
    setHistoryVersion((v) => v + 1);
  }, [setCall]);

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
        [stream, iceServers] = await Promise.all([getLocalMedia(video), loadIceServers(api.ice)]);
      } catch (e: any) {
        patch({ notice: e.message });
        return null;
      }
      const pc = createPeer(iceServers, signal, (remote) =>
        setCall((c) => ({ ...c, remoteStream: remote, mediaVersion: c.mediaVersion + 1 })),
      );
      stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
      const cam = stream.getVideoTracks()[0] ?? null;
      cameraTrack.current = cam;
      if (cam) pc.addTrack(cam, stream);
      // Voice calls still negotiate a video slot so camera/screen can be added mid-call
      // with replaceTrack() — no renegotiation needed. The callee gets it from the offer.
      else if (isCaller) pc.addTransceiver('video', { direction: 'sendrecv', streams: [stream] });
      pcRef.current = pc;
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
      patch({ phase: 'active', answeredAt: Date.now() });
      const pc = pcRef.current;
      if (pc) {
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
      chatStore.socket.emit('call:invite', { conversationId: conversation.id, video }, (res: any) => {
        if (!res?.ok) {
          cleanup();
          return;
        }
        patch({ callId: res.callId });
      });
      await preparePeer(video, true);
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
      patch({ sharingScreen: false, screenStream: null });
      await syncVideoSender();
      return;
    }
    try {
      const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0]!;
      screenTrack.current = track;
      // The browser's own "Stop sharing" button ends the track.
      track.onended = () => {
        if (screenTrack.current !== track) return;
        screenTrack.current = null;
        patch({ sharingScreen: false, screenStream: null });
        syncVideoSender();
      };
      patch({ sharingScreen: true, screenStream: display, notice: null });
      await syncVideoSender();
    } catch {
      // User cancelled the picker.
    }
  }, [patch, syncVideoSender]);

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
      flipCamera,
      sendReaction,
      historyVersion,
    }),
    [call, startCall, accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, toggleSpeaker, flipCamera, sendReaction, historyVersion],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}
