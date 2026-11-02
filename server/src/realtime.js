import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import * as presence from './presence.js';
import * as repo from './repo.js';

const RING_TIMEOUT_MS = 35_000;

export function createRealtime(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });
  const userRoom = (id) => `user:${id}`;
  // callId -> ring timeout handle
  const ringing = new Map();

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

  async function finishCall(callId, status, actorId) {
    clearTimeout(ringing.get(callId));
    ringing.delete(callId);
    const call = await repo.getCall(callId);
    if (!call || (call.status !== 'ringing' && call.status !== 'active')) return;
    const finalStatus = call.status === 'active' ? 'completed' : status;
    await repo.setCallStatus(callId, finalStatus);
    await toMembers(call.conversation_id, 'call:ended', { callId, status: finalStatus, by: actorId });
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

    // ----- calls (1:1 WebRTC signaling relay) -----

    socket.on(
      'call:invite',
      guard(async ({ conversationId, video }) => {
        if (!(await repo.isMember(conversationId, me))) throw new Error('not a member');
        const call = await repo.createCall(conversationId, me, video);
        const caller = repo.publicUser(await repo.getUserRow(me));
        const conversation = await repo.getConversation(conversationId, me);
        await toMembers(
          conversationId,
          'call:incoming',
          { callId: call.id, conversationId, video: !!video, caller, title: conversation.type === 'group' ? conversation.name : caller.displayName },
          me,
        );
        ringing.set(
          call.id,
          setTimeout(() => finishCall(call.id, 'missed', null).catch(console.error), RING_TIMEOUT_MS),
        );
        return { callId: call.id };
      }),
    );

    socket.on(
      'call:accept',
      guard(async ({ callId }) => {
        const call = await repo.getCall(callId);
        if (!call || call.status !== 'ringing' || !(await repo.isMember(call.conversation_id, me)))
          throw new Error('call is no longer ringing');
        clearTimeout(ringing.get(callId));
        ringing.delete(callId);
        await repo.setCallStatus(callId, 'active');
        await toMembers(call.conversation_id, 'call:accepted', { callId, by: me });
      }),
    );

    socket.on('call:decline', guard(async ({ callId }) => finishCall(callId, 'declined', me)));
    socket.on('call:end', guard(async ({ callId }) => finishCall(callId, 'missed', me)));

    socket.on(
      'call:signal',
      guard(async ({ callId, data }) => {
        const call = await repo.getCall(callId);
        if (!call || !(await repo.isMember(call.conversation_id, me))) throw new Error('unknown call');
        await toMembers(call.conversation_id, 'call:signal', { callId, from: me, data }, me);
      }),
    );

    socket.on('disconnect', () => {
      if (presence.disconnect(me)) {
        repo.touchLastSeen(me).catch(console.error);
        broadcastPresence(me, false).catch(console.error);
      }
    });
  });

  return {
    io,
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
    async broadcastUser(user) {
      for (const uid of await contactsOf(user.id)) io.to(userRoom(uid)).emit('user:updated', user);
    },
  };
}
