import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { createPeer, getLocalMedia, rtcSupported } from '@/lib/rtc';
import type { Conversation, User } from '@/lib/types';
import { useAuth } from './auth';
import { chatStore, useChat } from './chat-store';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active';

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  video: boolean;
  peer: User | null;
  title: string;
  answeredAt: number | null;
  micMuted: boolean;
  cameraOff: boolean;
  sharingScreen: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
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
  cameraOff: false,
  sharingScreen: false,
  localStream: null,
  remoteStream: null,
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
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  sendReaction: (emoji: string) => void;
  /** Bumped when the call log should refresh (a call just finished). */
  historyVersion: number;
};

const CallContext = createContext<CallApi | null>(null);

const NATIVE_NOTICE = 'Audio/video streams need the web or desktop app in this build. Signaling still works.';

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

  const patch = useCallback((p: Partial<CallState>) => setCall((c) => ({ ...c, ...p })), [setCall]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    acceptedHere.current = false;
    const { localStream } = callRef.current;
    localStream?.getTracks().forEach((t) => t.stop());
    cameraTrack.current?.stop();
    cameraTrack.current = null;
    setCall(IDLE);
    setHistoryVersion((v) => v + 1);
  }, [setCall]);

  const signal = useCallback((data: unknown) => {
    const { callId } = callRef.current;
    if (callId) chatStore.socket?.emit('call:signal', { callId, data });
  }, []);

  const preparePeer = useCallback(
    async (video: boolean) => {
      if (!rtcSupported()) {
        patch({ notice: NATIVE_NOTICE });
        return null;
      }
      let stream: MediaStream;
      try {
        stream = await getLocalMedia(video);
      } catch (e: any) {
        patch({ notice: e.message });
        return null;
      }
      const pc = createPeer(signal, (remote) => patch({ remoteStream: remote }));
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pcRef.current = pc;
      patch({ localStream: stream, cameraOff: !stream.getVideoTracks().length });
      return pc;
    },
    [patch, signal],
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
      const pc = pcRef.current;
      if (!pc) return;
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        for (const cand of pendingCandidates.current) await pc.addIceCandidate(cand).catch(() => {});
        pendingCandidates.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ type: 'answer', sdp: answer.sdp });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const cand of pendingCandidates.current) await pc.addIceCandidate(cand).catch(() => {});
        pendingCandidates.current = [];
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
  }, [user, connected, cleanup, patch, signal, setCall]);

  // Hang up if the user signs out mid-call.
  useEffect(() => {
    if (!user && callRef.current.phase !== 'idle') cleanup();
  }, [user, cleanup]);

  // ---------- actions ----------

  const startCall = useCallback(
    async (conversation: Conversation, video: boolean) => {
      if (callRef.current.phase !== 'idle' || !chatStore.socket) return;
      const peer = conversation.members.find((m) => m.id !== user?.id) ?? null;
      setCall({ ...IDLE, phase: 'outgoing', conversationId: conversation.id, video, peer, title: conversation.name });
      chatStore.socket.emit('call:invite', { conversationId: conversation.id, video }, (res: any) => {
        if (!res?.ok) {
          cleanup();
          return;
        }
        patch({ callId: res.callId });
      });
      await preparePeer(video);
    },
    [user, cleanup, patch, preparePeer, setCall],
  );

  const accept = useCallback(
    async (audioOnly?: boolean) => {
      const c = callRef.current;
      if (c.phase !== 'incoming' || !c.callId) return;
      acceptedHere.current = true;
      const video = c.video && !audioOnly;
      patch({ phase: 'active', answeredAt: Date.now(), video });
      await preparePeer(video);
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

  const toggleCamera = useCallback(() => {
    const c = callRef.current;
    const off = !c.cameraOff;
    c.localStream?.getVideoTracks().forEach((t) => (t.enabled = !off));
    patch({ cameraOff: off });
  }, [patch]);

  const toggleScreenShare = useCallback(async () => {
    const c = callRef.current;
    const pc = pcRef.current;
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
    if (!pc || !sender || !c.localStream) {
      patch({ notice: 'Screen sharing needs an active video call.' });
      return;
    }
    if (c.sharingScreen) {
      const cam = cameraTrack.current;
      if (cam) await sender.replaceTrack(cam);
      patch({ sharingScreen: false });
      return;
    }
    try {
      const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0]!;
      cameraTrack.current = sender.track;
      await sender.replaceTrack(track);
      track.onended = () => {
        if (cameraTrack.current) sender.replaceTrack(cameraTrack.current);
        patch({ sharingScreen: false });
      };
      patch({ sharingScreen: true });
    } catch {
      // User cancelled the picker.
    }
  }, [patch]);

  const sendReaction = useCallback(
    (emoji: string) => {
      signal({ type: 'reaction', emoji });
      patch({ reaction: { emoji, key: Date.now() } });
    },
    [signal, patch],
  );

  const value = useMemo<CallApi>(
    () => ({ call, startCall, accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, sendReaction, historyVersion }),
    [call, startCall, accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, sendReaction, historyVersion],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}

