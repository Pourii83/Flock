import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import * as presence from './presence.js';
import * as repo from './repo.js';

const RING_TIMEOUT_MS = 35_000;

export function createRealtime(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });
  const userRoom = (id) => `user:${id}`;

  /**
   * Live calls. A call is a mesh: every participant connects to every other one.
   * Direct calls end when either side leaves; group calls stay open while anyone is in them,
   * and members can join late.
   * callId -> { conversationId, isGroup, video, startedAt, participants: Map<userId, socketId>,
   *             ringing: Set<userId>, timer }
   */
  const live = new Map();

  async function toMembers(conversationId, event, payload, exceptUserId) {
    for (const uid of await repo.memberIds(conversationId)) {
      if (uid !== exceptUserId) io.to(userRoom(uid)).emit(event, payload);
    }
  }

  async function contactsOf(userId) {
    const convs = await repo.listConversations(userId);
    return new Set(convs.flatMap((c) => c.members.map((m) => m.id)).filter((id) => id !== userId));
  }

  async function broadcastPresence(userId, online) {
    const payload = { userId, online, lastSeen: Date.now() };
    for (const uid of await contactsOf(userId)) io.to(userRoom(uid)).emit('presence', payload);
  }

  const callState = (callId, c) => ({
    conversationId: c.conversationId,
    callId,
    video: c.video,
    startedAt: c.startedAt,
    participants: [...c.participants.keys()],
  });

  /** Tells every member which call (if any) is running in the conversation — drives "Join call". */
  const publishState = (callId, c) => toMembers(c.conversationId, 'call:state', callState(callId, c));

  async function finishCall(callId, status, actorId) {
    const c = live.get(callId);
    if (!c) return;
    live.delete(callId);
    clearTimeout(c.timer);
    const row = await repo.getCall(callId);
    if (!row || (row.status !== 'ringing' && row.status !== 'active')) return;
    const finalStatus = row.status === 'active' ? 'completed' : status;
    await repo.setCallStatus(callId, finalStatus);
    await toMembers(c.conversationId, 'call:ended', { callId, status: finalStatus, by: actorId });
    await toMembers(c.conversationId, 'call:state', { conversationId: c.conversationId, callId: null, participants: [] });
  }

  async function leaveCall(callId, userId, socketId) {
    const c = live.get(callId);
    if (!c || c.participants.get(userId) !== socketId) return;
    c.participants.delete(userId);
    // Direct calls (and empty group calls) end; otherwise the rest keep talking.
    if (!c.isGroup || c.participants.size === 0) return finishCall(callId, 'missed', userId);
    for (const sid of c.participants.values()) io.to(sid).emit('call:participant-left', { callId, userId });
    await publishState(callId, c);
  }

  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.userId;
    socket.join(userRoom(me));
    if (presence.connect(me)) broadcastPresence(me, true).catch(console.error);

    const guard = (handler) => async (payload, ack) => {
      try {
        const result = await handler(payload || {});
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    };

    socket.on(
      'typing',
      guard(async ({ conversationId, typing }) => {
        if (!(await repo.isMember(conversationId, me))) throw new Error('not a member');
        await toMembers(conversationId, 'typing', { conversationId, userId: me, typing: !!typing }, me);
      }),
    );

    // ----- calls: mesh signaling -----

    socket.on(
      'call:invite',
      guard(async ({ conversationId, video }) => {
        if (!(await repo.isMember(conversationId, me))) throw new Error('not a member');
        for (const [id, c] of live) {
          if (c.conversationId === conversationId) return { callId: id, alreadyRunning: true };
        }
        const conversation = await repo.getConversation(conversationId, me);
        const call = await repo.createCall(conversationId, me, video);
        const caller = repo.publicUser(await repo.getUserRow(me));
        const others = conversation.members.map((m) => m.id).filter((id) => id !== me);
        const c = {
          conversationId,
          isGroup: conversation.type === 'group',
          video: !!video,
          startedAt: Date.now(),
          participants: new Map([[me, socket.id]]),
          ringing: new Set(others),
          timer: null,
        };
        live.set(call.id, c);
        // Ringing stops after a while; a group call keeps running if someone joined.
        c.timer = setTimeout(() => {
          const cur = live.get(call.id);
          if (!cur) return;
          for (const uid of cur.ringing) io.to(userRoom(uid)).emit('call:ring-stop', { callId: call.id });
          cur.ringing.clear();
          if (cur.participants.size <= 1) finishCall(call.id, 'missed', null).catch(console.error);
        }, RING_TIMEOUT_MS);
        await toMembers(
          conversationId,
          'call:incoming',
          {
            callId: call.id,
            conversationId,
            video: !!video,
            caller,
            isGroup: c.isGroup,
            title: c.isGroup ? conversation.name : caller.displayName,
          },
          me,
        );
        await publishState(call.id, c);
        return { callId: call.id };
      }),
    );

    // Answer a ringing call, or join a group call that is already running.
    socket.on(
      'call:accept',
      guard(async ({ callId }) => {
        const c = live.get(callId);
        if (!c || !(await repo.isMember(c.conversationId, me))) throw new Error('call is no longer available');
        if (!c.isGroup && c.participants.size >= 2 && !c.participants.has(me)) throw new Error('call is no longer available');
        // Already in it from another device: that device hangs up.
        const previous = c.participants.get(me);
        c.participants.set(me, socket.id);
        c.ringing.delete(me);
        const row = await repo.getCall(callId);
        if (row?.status === 'ringing') await repo.setCallStatus(callId, 'active');
        if (!c.isGroup) {
          clearTimeout(c.timer);
          c.ringing.clear();
        }
        await toMembers(c.conversationId, 'call:accepted', { callId, by: me, socketId: socket.id });
        if (previous && previous !== socket.id) io.to(previous).emit('call:ended', { callId, status: 'moved', by: me });
        for (const [uid, sid] of c.participants) {
          if (uid !== me) io.to(sid).emit('call:participant-joined', { callId, userId: me });
        }
        await publishState(callId, c);
        // The newcomer opens a connection to everyone already in the call.
        return { participants: [...c.participants.keys()].filter((id) => id !== me), video: c.video, isGroup: c.isGroup };
      }),
    );

    socket.on(
      'call:decline',
      guard(async ({ callId }) => {
        const c = live.get(callId);
        if (!c) return;
        c.ringing.delete(me);
        io.to(userRoom(me)).emit('call:ring-stop', { callId }); // my other devices stop ringing too
        if (!c.isGroup) return finishCall(callId, 'declined', me);
        if (c.ringing.size === 0 && c.participants.size <= 1) return finishCall(callId, 'declined', me);
      }),
    );

    socket.on(
      'call:end',
      guard(async ({ callId }) => leaveCall(callId, me, socket.id)),
    );

    // Relay WebRTC signaling: to one participant (`to`) or to all others.
    socket.on(
      'call:signal',
      guard(async ({ callId, to, data }) => {
        const c = live.get(callId);
        if (!c || c.participants.get(me) !== socket.id) throw new Error('not in this call');
        const payload = { callId, from: me, data };
        if (to) {
          const sid = c.participants.get(to);
          if (sid) io.to(sid).emit('call:signal', payload);
        } else {
          for (const [uid, sid] of c.participants) if (uid !== me) io.to(sid).emit('call:signal', payload);
        }
      }),
    );

    socket.on('disconnect', () => {
      // A participant's connection is gone (tab closed, network lost): take them out of their calls.
      for (const [callId, c] of live) {
        if (c.participants.get(me) === socket.id) leaveCall(callId, me, socket.id).catch(console.error);
      }
      if (presence.disconnect(me)) {
        repo.touchLastSeen(me).catch(console.error);
        broadcastPresence(me, false).catch(console.error);
      }
    });
  });

  return {
    io,
    /** Running calls in the user's conversations (for "Join call" after a reload). */
    async activeCalls(userId) {
      const out = [];
      for (const [callId, c] of live) {
        if (await repo.isMember(c.conversationId, userId)) out.push(callState(callId, c));
      }
      return out;
    },
    async notifyMessage(message) {
      await toMembers(message.conversationId, 'message:new', message);
    },
    async notifyRead(conversationId, userId, readAt) {
      await toMembers(conversationId, 'conversation:read', { conversationId, userId, readAt });
    },
    async notifyConversation(conversationId) {
      for (const uid of await repo.memberIds(conversationId)) {
        io.to(userRoom(uid)).emit('conversation:new', await repo.getConversation(conversationId, uid));
      }
    },
    /** A member was removed or left: their devices drop the conversation. */
    notifyRemoved(conversationId, userId) {
      io.to(userRoom(userId)).emit('conversation:removed', { conversationId });
    },
    async broadcastUser(user) {
      for (const uid of await contactsOf(user.id)) io.to(userRoom(uid)).emit('user:updated', user);
    },
  };
}
