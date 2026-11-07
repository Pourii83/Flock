import { Server } from 'socket.io';
import { verifyGuestToken, verifyToken } from './auth.js';
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
   * callId -> { conversationId, isGroup, title, video, startedAt,
   *             participants: Map<userId, socketId>, invited: Set<userId>, ringing: Set<userId>, timer }
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

  async function toCallAudience(c, event, payload) {
    await toMembers(c.conversationId, event, payload);
    for (const uid of c.invited) io.to(userRoom(uid)).emit(event, payload);
  }

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
    await toCallAudience(c, 'call:ended', { callId, status: finalStatus, by: actorId });
    await toMembers(c.conversationId, 'call:state', { conversationId: c.conversationId, callId: null, participants: [] });
  }

  /** A meeting room was closed or expired: everyone in it is sent out. */
  function closeRoom(roomId) {
    const c = live.get(roomId);
    if (!c?.roomId) return;
    live.delete(roomId);
    clearTimeout(c.timer);
    for (const sid of c.participants.values()) io.to(sid).emit('call:ended', { callId: roomId, status: 'closed' });
  }

  async function leaveCall(callId, userId, socketId) {
    const c = live.get(callId);
    if (!c || c.participants.get(userId) !== socketId) return;
    c.participants.delete(userId);
    if (c.roomId) {
      // The room's link stays valid; only the live session goes away when the last person leaves.
      c.people.delete(userId);
      if (c.participants.size === 0) {
        live.delete(callId);
        clearTimeout(c.timer);
      } else {
        for (const sid of c.participants.values()) io.to(sid).emit('call:participant-left', { callId, userId });
      }
      return;
    }
    // Direct calls (and empty group calls) end; otherwise the rest keep talking.
    if (!c.isGroup || c.participants.size === 0) return finishCall(callId, 'missed', userId);
    for (const sid of c.participants.values()) io.to(sid).emit('call:participant-left', { callId, userId });
    await publishState(callId, c);
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const userId = verifyToken(token);
    if (userId) {
      socket.data.userId = userId;
      return next();
    }
    // Meeting guests: no account, allowed only into their one room.
    const guest = verifyGuestToken(token);
    if (!guest) return next(new Error('unauthorized'));
    socket.data.userId = guest.guestId;
    socket.data.guest = guest;
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.userId;
    const guest = socket.data.guest ?? null;
    if (!guest) {
      socket.join(userRoom(me));
      if (presence.connect(me)) broadcastPresence(me, true).catch(console.error);
    }

    const guard = (handler) => async (payload, ack) => {
      try {
        const result = await handler(payload || {});
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    };

    // ----- meeting rooms: open to anyone with the link (guests included) -----

    socket.on(
      'room:join',
      guard(async ({ code }) => {
        const room = await repo.getRoomByCode(code);
        if (!repo.roomIsOpen(room) || (guest && guest.roomId !== room.id)) throw new Error('This meeting has ended');
        const callId = room.id;
        let c = live.get(callId);
        if (!c) {
          c = {
            roomId: room.id,
            conversationId: null,
            isGroup: true,
            title: room.title,
            video: false,
            startedAt: Date.now(),
            participants: new Map(),
            people: new Map(),
            invited: new Set(),
            ringing: new Set(),
            timer: null,
          };
          live.set(callId, c);
          // Everyone is sent out when the link expires (timers cap at ~24.8 days; joins re-check anyway).
          if (room.expiresAt) c.timer = setTimeout(() => closeRoom(room.id), Math.min(Math.max(0, room.expiresAt - Date.now()), 2 ** 31 - 1));
        }
        const meUser = guest ? repo.guestUser(me, guest.name) : repo.publicUser(await repo.getUserRow(me));
        const previous = c.participants.get(me);
        c.participants.set(me, socket.id);
        c.people.set(me, meUser);
        if (previous && previous !== socket.id) io.to(previous).emit('call:ended', { callId, status: 'moved', by: me });
        for (const [uid, sid] of c.participants) {
          if (uid !== me) io.to(sid).emit('call:participant-joined', { callId, userId: me, user: meUser });
        }
        return {
          callId,
          title: c.title,
          participants: [...c.participants.keys()].filter((id) => id !== me).map((id) => c.people.get(id)),
          room: { code: room.code, ownerId: room.ownerId, expiresAt: room.expiresAt },
          me: meUser,
        };
      }),
    );

    // Everything below needs an account.
    const member = (handler) => guard(async (payload) => {
      if (guest) throw new Error('not allowed');
      return handler(payload);
    });

    socket.on(
      'typing',
      member(async ({ conversationId, typing }) => {
        if (!(await repo.isMember(conversationId, me))) throw new Error('not a member');
        await toMembers(conversationId, 'typing', { conversationId, userId: me, typing: !!typing }, me);
      }),
    );

    // ----- calls: mesh signaling -----

    socket.on(
      'call:invite',
      member(async ({ conversationId, video }) => {
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
          title: conversation.name,
          video: !!video,
          startedAt: Date.now(),
          participants: new Map([[me, socket.id]]),
          invited: new Set(),
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

    // Invite non-members through a private conversation. Access exists only in this live call.
    socket.on(
      'call:invite-guests',
      member(async ({ callId, userIds }) => {
        const c = live.get(callId);
        if (!c?.isGroup || c.participants.get(me) !== socket.id) throw new Error('not in this group call');
        const groupMembers = new Set(await repo.memberIds(c.conversationId));
        const candidates = (await repo.getPublicUsers(Array.isArray(userIds) ? userIds : [])).filter(
          (target) => target.id !== me && !groupMembers.has(target.id) && !c.participants.has(target.id) && !c.invited.has(target.id),
        );
        const inviter = repo.publicUser(await repo.getUserRow(me));
        for (const target of candidates) {
          c.invited.add(target.id);
          const { id: directId, created } = await repo.createConversation(me, [target.id]);
          if (created) {
            for (const uid of [me, target.id]) io.to(userRoom(uid)).emit('conversation:new', await repo.getConversation(directId, uid));
          }
          const message = await repo.addMessage(directId, me, {
            kind: 'call_invite',
            body: JSON.stringify({ callId, title: c.title, inviter: inviter.displayName }),
          });
          await toMembers(directId, 'message:new', message);
        }
        return { invited: candidates };
      }),
    );

    // Answer a ringing call, or join a group call that is already running.
    socket.on(
      'call:accept',
      member(async ({ callId }) => {
        const c = live.get(callId);
        const member = c && (await repo.isMember(c.conversationId, me));
        if (!c || (!member && !c.invited.has(me))) throw new Error('call is no longer available');
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
        const joinedUser = repo.publicUser(await repo.getUserRow(me));
        for (const [uid, sid] of c.participants) {
          if (uid !== me) io.to(sid).emit('call:participant-joined', { callId, userId: me, user: joinedUser });
        }
        await publishState(callId, c);
        // The newcomer opens a connection to everyone already in the call.
        const participantIds = [...c.participants.keys()].filter((id) => id !== me);
        return {
          participants: await repo.getPublicUsers(participantIds),
          video: c.video,
          isGroup: c.isGroup,
          conversationId: c.conversationId,
          // Direct conversations are named after "the other person", seen from the caller: only groups have a shared title.
          title: c.isGroup ? c.title : undefined,
          guest: !member,
        };
      }),
    );

    socket.on(
      'call:decline',
      member(async ({ callId }) => {
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
      if (!guest && presence.disconnect(me)) {
        repo.touchLastSeen(me).catch(console.error);
        broadcastPresence(me, false).catch(console.error);
      }
    });
  });

  return {
    io,
    closeRoom,
    /** Live calls and meeting rooms right now (admin usage). */
    liveStats() {
      let calls = 0;
      let rooms = 0;
      let inCalls = 0;
      for (const c of live.values()) {
        if (c.roomId) rooms++;
        else calls++;
        inCalls += c.participants.size;
      }
      return { liveCalls: calls, liveRooms: rooms, inCalls };
    },
    /** Running calls in the user's conversations (for "Join call" after a reload). */
    async activeCalls(userId) {
      const out = [];
      for (const [callId, c] of live) {
        if (!c.roomId && (await repo.isMember(c.conversationId, userId))) out.push(callState(callId, c));
      }
      return out;
    },
    async invitedCall(userId, callId) {
      const c = live.get(callId);
      if (!c || c.roomId || (!c.invited.has(userId) && !(await repo.isMember(c.conversationId, userId)))) return null;
      return { ...callState(callId, c), title: c.title, isGroup: c.isGroup };
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
