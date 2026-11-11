import { Router } from 'express';
import crypto from 'node:crypto';
import { checkPassword, hashPassword, requireAuth, signFileLink, signGuestToken, signToken, verifyFileLink, verifyGuestToken, verifyToken } from './auth.js';
import { deleteAvatar, saveAvatar } from './avatars.js';
import { copyStoredFile, deleteStoredFile, receiveFile, safeMimeType, storedFilePath } from './files.js';
import { getSettings, MAIN_REPO_URL, updateSettings } from './settings.js';
import { serverUsage } from './usage.js';
import { installedVersion, releaseNotes, releaseNotesFa } from './version.js';
import { serverUpdateInfo, startSelfUpdate } from './releases.js';
import * as repo from './repo.js';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export function createRouter(realtime) {
  const r = Router();

  // Also tells the apps the server's limits.
  r.get('/health', (_req, res) => {
    const s = getSettings();
    res.json({ ok: true, maxUploadMb: s.maxUploadMb, allowRegistration: s.allowRegistration });
  });

  // Public branding: the admin's app name, project link and the installed version.
  r.get('/branding', async (_req, res) => {
    const s = getSettings();
    res.json({ appName: s.appName, repoUrl: MAIN_REPO_URL, showRepoLinks: true, version: await installedVersion() });
  });

  // Public update info: the installed version and the changelog packaged with it.
  r.get('/update', async (_req, res) => res.json({ version: await installedVersion(), notes: await releaseNotes(), notesFa: await releaseNotesFa() }));

  // ---------- auth ----------

  r.post('/auth/register', async (req, res) => {
    if (!getSettings().allowRegistration) return res.status(403).json({ error: 'Sign-up is closed on this server' });
    const { username = '', displayName = '', password = '' } = req.body || {};
    const name = String(displayName).trim();
    if (!USERNAME_RE.test(username))
      return res.status(400).json({ error: 'Username must be 3–24 letters, numbers, _ or .' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (await repo.getUserByUsername(username)) return res.status(409).json({ error: 'That username is taken' });
    const user = await repo.createUser({
      username,
      displayName: name.slice(0, 60) || username,
      passwordHash: await hashPassword(String(password)),
    });
    res.status(201).json({ token: signToken(user.id), user: repo.selfUser(user) });
  });

  r.post('/auth/login', async (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const user = await repo.getUserByUsername(String(username));
    if (!user || !(await checkPassword(String(password), user.password_hash)))
      return res.status(401).json({ error: 'Wrong username or password' });
    res.json({ token: signToken(user.id), user: repo.selfUser(user) });
  });

  // ---------- meeting rooms: public side (no account needed) ----------

  const MAX_ROOM_MINUTES = 30 * 24 * 60;

  r.get('/rooms/public/:code', async (req, res) => {
    const room = await repo.getRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: 'This meeting link is not valid' });
    const host = repo.publicUser(await repo.getUserRow(room.ownerId));
    res.json({ code: room.code, title: room.title, expiresAt: room.expiresAt, open: repo.roomIsOpen(room), host: host && { displayName: host.displayName, avatarUrl: host.avatarUrl, avatarColor: host.avatarColor } });
  });

  // A guest picks a name and gets a pass for this one room, valid at most until the room expires.
  r.post('/rooms/public/:code/guest', async (req, res) => {
    if (!getSettings().allowGuestMeetings) return res.status(403).json({ error: 'Guests can’t join meetings on this server — sign in to join' });
    const room = await repo.getRoomByCode(req.params.code);
    if (!repo.roomIsOpen(room)) return res.status(410).json({ error: 'This meeting has ended' });
    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Enter your name to join' });
    const guestId = crypto.randomUUID();
    const seconds = room.expiresAt ? (room.expiresAt - Date.now()) / 1000 : 24 * 3600;
    const token = signGuestToken({ guestId, name, roomId: room.id }, seconds);
    res.json({ token, user: repo.guestUser(guestId, name) });
  });

  // ICE servers for WebRTC: open to signed-in users and to meeting guests (they need the TURN relay
  // too, otherwise two guests behind NAT or a relay-only setup can never connect). TURN credentials
  // are short-lived (TURN REST API, coturn "use-auth-secret"), so the shared secret never reaches clients.
  r.get('/ice', (req, res) => {
    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
    const identity = verifyToken(bearer) ?? verifyGuestToken(bearer)?.guestId;
    if (!identity) return res.status(401).json({ error: 'Not signed in' });
    const iceServers = [{ urls: process.env.STUN_URLS?.split(',') ?? ['stun:stun.l.google.com:19302'] }];
    // TURN_EXTRA_URLS: other relays sharing the secret (e.g. eturnal on another server), tried first.
    const turnUrls = [process.env.TURN_EXTRA_URLS, process.env.TURN_URLS]
      .flatMap((v) => v?.split(',') ?? [])
      .map((u) => u.trim())
      .filter(Boolean);
    if (turnUrls.length && process.env.TURN_SECRET) {
      const ttl = 12 * 3600;
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${identity}`;
      const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }
    // TURN_RELAY_ONLY=1 sends all call media through the relay (hides users' IPs, steadier calls).
    const relayOnly = process.env.TURN_RELAY_ONLY === '1' && iceServers.length > 1;
    res.json({ iceServers, ...(relayOnly ? { iceTransportPolicy: 'relay' } : {}) });
  });

  /** Streams a stored attachment (Range requests work). */
  async function sendAttachment(res, attachment) {
    if (!attachment) return res.status(404).json({ error: 'File not found' });
    if (!attachment.attachment_path || attachment.attachment_expires_at <= Date.now()) {
      if (attachment.attachment_path) await deleteStoredFile(attachment.attachment_path);
      return res.status(410).json({ error: 'File expired' });
    }
    const file = storedFilePath(attachment.attachment_path);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', attachment.attachment_mime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Uploaded HTML/SVG must never run as the app's origin, even when opened directly.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.attachment_name)}`);
    res.sendFile(file);
  }

  // Signed link (see POST /files/:messageId/link): lets a <video> stream with Range requests.
  r.get('/f/:messageId', async (req, res) => {
    if (!verifyFileLink(req.params.messageId, req.query.e, req.query.s)) return res.status(403).json({ error: 'This link has expired' });
    await sendAttachment(res, await repo.getAttachmentById(req.params.messageId));
  });

  r.use(requireAuth);

  // ---------- admin: app settings and server usage ----------

  const admin = async (req, res, next) => {
    const me = await repo.getUserRow(req.userId);
    if (!me?.is_admin) return res.status(403).json({ error: 'Only the server admin can do this' });
    next();
  };

  r.get('/admin/settings', admin, (_req, res) => res.json(getSettings()));

  r.patch('/admin/settings', admin, async (req, res) => {
    try {
      res.json(await updateSettings(req.body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.get('/admin/usage', admin, async (_req, res) => res.json(await serverUsage(realtime.liveStats())));

  // Server updates are based on GitHub Releases only (not commits): the admin panel compares the
  // installed numeric release with the latest release and can start a detached self-update.
  r.get('/admin/server-update', admin, async (_req, res) => res.json(await serverUpdateInfo()));
  r.post('/admin/server-update', admin, async (req, res) => {
    const result = await startSelfUpdate(String(req.body?.tag ?? ''));
    res.status(result.ok ? 202 : 400).json(result);
  });

  // ---------- meeting rooms: owner side ----------

  r.get('/rooms', async (req, res) => res.json(await repo.listOpenRooms(req.userId)));

  r.post('/rooms', async (req, res) => {
    const title = String(req.body?.title ?? '').trim().slice(0, 80);
    const minutes = req.body?.expiresInMinutes;
    // null = open until the owner closes it.
    if (minutes != null && !(Number.isFinite(minutes) && minutes >= 5 && minutes <= MAX_ROOM_MINUTES))
      return res.status(400).json({ error: 'Pick how long the link stays valid' });
    const room = await repo.createRoom(req.userId, { title, expiresAt: minutes == null ? null : Date.now() + minutes * 60_000 });
    res.status(201).json(room);
  });

  r.delete('/rooms/:id', async (req, res) => {
    const room = await repo.closeRoom(req.params.id, req.userId);
    if (!room) return res.status(404).json({ error: 'Not found' });
    realtime.closeRoom(room.id);
    res.json(room);
  });

  // ---------- profile & people ----------

  r.get('/me', async (req, res) => {
    const user = await repo.getUserRow(req.userId);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json(repo.selfUser(user));
  });

  r.patch('/me', async (req, res) => {
    const { displayName, bio, title, username } = req.body || {};
    if (username !== undefined) {
      if (typeof username !== 'string' || !USERNAME_RE.test(username))
        return res.status(400).json({ error: 'Usernames are 3–24 letters, numbers, _ or .' });
      const taken = await repo.getUserByUsername(username);
      if (taken && taken.id !== req.userId) return res.status(409).json({ error: 'That username is taken' });
    }
    let row;
    try {
      row = await repo.updateUser(req.userId, {
        displayName: displayName?.trim()?.slice(0, 60) || undefined,
        bio: bio?.slice(0, 280),
        title: title?.slice(0, 60),
        username,
      });
    } catch (e) {
      // Lost a race for the same name against another sign-up or rename.
      if (e?.code === '23505') return res.status(409).json({ error: 'That username is taken' });
      throw e;
    }
    realtime.broadcastUser(repo.publicUser(row));
    res.json(repo.selfUser(row));
  });

  r.put('/me/avatar', async (req, res) => {
    let file;
    try {
      file = await saveAvatar(req.userId, req.body?.data);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const previous = (await repo.getUserRow(req.userId))?.avatar_path;
    const row = await repo.setAvatarPath(req.userId, file);
    await deleteAvatar(previous);
    realtime.broadcastUser(repo.publicUser(row));
    res.json(repo.selfUser(row));
  });

  r.delete('/me/avatar', async (req, res) => {
    const previous = (await repo.getUserRow(req.userId))?.avatar_path;
    const row = await repo.setAvatarPath(req.userId, null);
    await deleteAvatar(previous);
    realtime.broadcastUser(repo.publicUser(row));
    res.json(repo.selfUser(row));
  });

  // ?scope=contacts lists people I already chat with; otherwise a 3+ character directory search.
  r.get('/users', async (req, res) =>
    res.json(req.query.scope === 'contacts' ? await repo.contactUsers(req.userId, req.query.q) : await repo.searchUsers(req.userId, req.query.q)),
  );

  r.get('/users/:id', async (req, res) => {
    const user = repo.publicUser(await repo.getUserRow(req.params.id));
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  });

  // ---------- conversations ----------

  r.get('/conversations', async (req, res) => res.json(await repo.listConversations(req.userId)));

  r.post('/conversations', async (req, res) => {
    const { userIds = [], name, description, channel } = req.body || {};
    try {
      const groupName = typeof name === 'string' ? name.trim().slice(0, 80) : undefined;
      const kind = channel === true ? 'channel' : 'group';
      const { id, created } = await repo.createConversation(req.userId, userIds, groupName, typeof description === 'string' ? description.trim() : '', kind);
      if (created) {
        await realtime.notifyConversation(id);
        if (groupName) await systemMessage(id, req.userId, { e: kind === 'channel' ? 'created-channel' : 'created', name: groupName });
      }
      res.status(created ? 201 : 200).json(await repo.getConversation(id, req.userId));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Saved Messages: the user's own notes conversation, created on first use. (Registered before /conversations/:id.)
  r.get('/conversations/saved', async (req, res) => {
    const { id, created } = await repo.getOrCreateSaved(req.userId);
    if (created) await realtime.notifyConversation(id);
    res.json(await repo.getConversation(id, req.userId));
  });

  const member = async (req, res, next) => {
    if (!(await repo.isMember(req.params.id, req.userId))) return res.status(404).json({ error: 'Conversation not found' });
    next();
  };

  // ---------- reactions and saving messages ----------

  /** Loads the message and checks the caller can see its conversation. */
  async function visibleMessage(req, res) {
    const message = await repo.getMessageRow(req.params.messageId);
    if (!message || !(await repo.isMember(message.conversation_id, req.userId))) {
      res.status(404).json({ error: 'Message not found' });
      return null;
    }
    return message;
  }

  // Add (`on: true`), remove (`on: false`) or toggle (no `on`) one emoji reaction of mine.
  r.post('/messages/:messageId/react', async (req, res) => {
    const emoji = String(req.body?.emoji ?? '');
    if (!emoji || emoji.length > 16 || !/\p{Extended_Pictographic}/u.test(emoji)) return res.status(400).json({ error: 'Pick an emoji' });
    const message = await visibleMessage(req, res);
    if (!message) return;
    if (message.kind === 'system' || message.kind === 'call') return res.status(400).json({ error: 'You can’t react to this message' });
    const on = typeof req.body?.on === 'boolean' ? req.body.on : undefined;
    const reactions = await repo.setReaction(message.id, req.userId, emoji, on);
    await realtime.notifyReactions(message.conversation_id, { conversationId: message.conversation_id, messageId: message.id, reactions });
    res.json({ messageId: message.id, reactions });
  });

  // Copies a message into my Saved Messages, noting who it came from.
  r.post('/messages/:messageId/save', async (req, res) => {
    const src = await visibleMessage(req, res);
    if (!src) return;
    const srcConv = await repo.getConversationRow(src.conversation_id);
    if (srcConv.secret) return res.status(400).json({ error: 'Messages from secret chats can’t be saved' });
    if (srcConv.saved) return res.status(400).json({ error: 'This message is already in Saved Messages' });
    if (src.kind !== 'text' && src.kind !== 'file') return res.status(400).json({ error: 'This message can’t be saved' });
    const { id, created } = await repo.getOrCreateSaved(req.userId);
    if (created) await realtime.notifyConversation(id);
    const sender = await repo.getUserRow(src.sender_id);
    let attachment = null;
    if (src.attachment_name) {
      const live = src.attachment_path && src.attachment_expires_at > Date.now();
      const copy = live ? await copyStoredFile(src.attachment_path) : null;
      if (!copy) return res.status(410).json({ error: 'File expired' });
      attachment = { name: src.attachment_name, mimeType: src.attachment_mime, size: src.attachment_size, path: copy, expiresAt: src.attachment_expires_at };
    }
    try {
      const message = await repo.addMessage(id, req.userId, {
        kind: src.kind,
        body: src.body,
        attachment,
        forwardedFrom: src.forwarded_from ?? sender?.display_name ?? '',
      });
      await realtime.notifyMessage(message);
      res.status(201).json(message);
    } catch (error) {
      if (attachment) await deleteStoredFile(attachment.path);
      throw error;
    }
  });

  // Sender edits the text of their own message.
  r.patch('/messages/:messageId', async (req, res) => {
    const message = await visibleMessage(req, res);
    if (!message) return;
    if (message.sender_id !== req.userId) return res.status(403).json({ error: 'You can only edit your own messages' });
    if (message.kind !== 'text') return res.status(400).json({ error: 'Only text messages can be edited' });
    const { body, error } = await messageText(message.conversation_id, req.body?.body);
    if (error) return res.status(error.status).json({ error: error.message });
    const updated = await repo.updateMessageBody(message.id, body);
    if (!updated) return res.status(404).json({ error: 'Message not found' });
    await realtime.notifyMessageUpdated(message.conversation_id, updated);
    res.json(updated);
  });

  // Sender deletes their own message; its stored file (if any) goes too.
  r.delete('/messages/:messageId', async (req, res) => {
    const message = await visibleMessage(req, res);
    if (!message) return;
    if (message.sender_id !== req.userId) return res.status(403).json({ error: 'You can only delete your own messages' });
    const deleted = await repo.deleteMessage(message.id);
    if (!deleted) return res.status(404).json({ error: 'Message not found' });
    if (deleted.attachment_path) await deleteStoredFile(deleted.attachment_path);
    await realtime.notifyMessageDeleted(message.conversation_id, message.id);
    res.json({ ok: true, messageId: message.id });
  });

  // Copies a message into another conversation I'm in, noting the original sender.
  r.post('/messages/:messageId/forward', async (req, res) => {
    const src = await visibleMessage(req, res);
    if (!src) return;
    if (src.kind !== 'text' && src.kind !== 'file') return res.status(400).json({ error: 'This message can’t be forwarded' });
    const targetId = req.body?.conversationId;
    if (!(await repo.isMember(targetId, req.userId))) return res.status(404).json({ error: 'Conversation not found' });
    const [srcConv, targetConv] = await Promise.all([repo.getConversationRow(src.conversation_id), repo.getConversationRow(targetId)]);
    if (!targetConv) return res.status(404).json({ error: 'Conversation not found' });
    if (await postingBlocked(targetId, req.userId)) return res.status(403).json({ error: CHANNEL_READ_ONLY });
    if (srcConv?.secret || targetConv.secret) return res.status(400).json({ error: 'Forwarding is not available in secret chats' });
    let attachment = null;
    if (src.attachment_name) {
      const live = src.attachment_path && src.attachment_expires_at > Date.now();
      const copy = live ? await copyStoredFile(src.attachment_path) : null;
      if (!copy) return res.status(410).json({ error: 'File expired' });
      attachment = { name: src.attachment_name, mimeType: src.attachment_mime, size: src.attachment_size, path: copy, expiresAt: src.attachment_expires_at };
    }
    const sender = await repo.getUserRow(src.sender_id);
    try {
      const message = await repo.addMessage(targetId, req.userId, {
        kind: src.kind,
        body: src.body,
        attachment,
        forwardedFrom: src.forwarded_from ?? sender?.display_name ?? '',
      });
      await realtime.notifyMessage(message);
      res.status(201).json(message);
    } catch (error) {
      if (attachment) await deleteStoredFile(attachment.path);
      throw error;
    }
  });

  // Pins, unpins (`on: false`) or toggles (no `on`) a message in its conversation.
  r.post('/messages/:messageId/pin', async (req, res) => {
    const message = await visibleMessage(req, res);
    if (!message) return;
    if (message.kind !== 'text' && message.kind !== 'file') return res.status(400).json({ error: 'You can’t pin this message' });
    if (await postingBlocked(message.conversation_id, req.userId)) return res.status(403).json({ error: 'Only channel admins can pin messages' });
    const on = typeof req.body?.on === 'boolean' ? req.body.on : undefined;
    const result = await repo.setPinned(message.id, on);
    if (!result) return res.status(404).json({ error: 'Message not found' });
    await realtime.notifyPinned(message.conversation_id, message.id, result.pinnedAt);
    res.json(result);
  });

  // ---------- end-to-end encrypted ("secret") chats ----------

  // Each device registers the public half of its key pair; the private half never leaves it.
  r.post('/devices', async (req, res) => {
    try {
      res.status(201).json({ id: await repo.registerDevice(req.userId, req.body?.publicKey) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.post('/conversations/secret', async (req, res) => {
    try {
      const id = await repo.createSecretConversation(req.userId, req.body?.userId, req.body?.deviceId);
      await realtime.notifyConversation(id);
      res.status(201).json(await repo.getConversation(id, req.userId));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.post('/conversations/:id/secret/accept', member, async (req, res) => {
    try {
      await repo.acceptSecret(req.params.id, req.userId, req.body?.deviceId);
      await realtime.notifyConversation(req.params.id);
      res.json(await repo.getConversation(req.params.id, req.userId));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.get('/conversations/:id', member, async (req, res) => res.json(await repo.getConversation(req.params.id, req.userId)));

  r.patch('/conversations/:id', member, async (req, res) => {
    const { pinned, muted } = req.body || {};
    await repo.updateMembership(req.params.id, req.userId, {
      pinned: typeof pinned === 'boolean' ? pinned : undefined,
      muted: typeof muted === 'boolean' ? muted : undefined,
    });
    res.json(await repo.getConversation(req.params.id, req.userId));
  });

  r.get('/conversations/:id/messages', member, async (req, res) =>
    res.json(await repo.listMessages(req.params.id, { before: req.query.before, limit: req.query.limit })),
  );

  // Search inside one conversation (newest match first); `before` limits it to older messages.
  r.get('/conversations/:id/search', member, async (req, res) =>
    res.json(await repo.searchMessages(req.params.id, { q: req.query.q, before: req.query.before })),
  );

  // The conversation's pinned messages, newest pin first.
  r.get('/conversations/:id/pinned', member, async (req, res) =>
    res.json(await repo.listPinnedMessages(req.params.id)),
  );

  /**
   * The text to store for a message in this conversation: plain text up to 4000 characters, or,
   * in end-to-end encrypted chats, only a v1 ciphertext envelope once both devices are known.
   */
  async function messageText(conversationId, rawBody) {
    const body = String(rawBody ?? '').trim();
    if (!body) return { error: { status: 400, message: 'Message is empty' } };
    const secret = await repo.getSecretState(conversationId);
    if (secret?.secret) {
      if (!secret.secret_recipient_device)
        return { error: { status: 409, message: 'Waiting for the other person to accept the secret chat' } };
      let envelope = null;
      try {
        envelope = JSON.parse(body);
      } catch {
        envelope = null;
      }
      if (envelope?.v !== 1 || typeof envelope.n !== 'string' || typeof envelope.c !== 'string' || body.length > 16000)
        return { error: { status: 400, message: 'Secret chats only accept encrypted messages' } };
    } else if (body.length > 4000) return { error: { status: 400, message: 'Message is too long' } };
    return { body };
  }

  /** Channels are broadcast-only: just the owner and admins may post, pin or forward into them. */
  async function postingBlocked(conversationId, userId) {
    const conv = await repo.getConversationRow(conversationId);
    if (conv?.type !== 'channel') return false;
    const role = await repo.getRole(conversationId, userId);
    return !role || repo.ROLE_RANK[role] < repo.ROLE_RANK.admin;
  }
  const CHANNEL_READ_ONLY = 'Only channel admins can post here';

  r.post('/conversations/:id/messages', member, async (req, res) => {
    if (await postingBlocked(req.params.id, req.userId)) return res.status(403).json({ error: CHANNEL_READ_ONLY });
    const { body, error } = await messageText(req.params.id, req.body?.body);
    if (error) return res.status(error.status).json({ error: error.message });
    const message = await repo.addMessage(req.params.id, req.userId, { body, replyToId: req.body?.replyToId });
    await realtime.notifyMessage(message);
    res.status(201).json(message);
  });

  r.post('/conversations/:id/files', member, receiveFile, async (req, res) => {
    if (await postingBlocked(req.params.id, req.userId)) {
      if (req.file) await deleteStoredFile(req.file.filename);
      return res.status(403).json({ error: CHANNEL_READ_ONLY });
    }
    if ((await repo.getSecretState(req.params.id))?.secret) {
      if (req.file) await deleteStoredFile(req.file.filename);
      return res.status(400).json({ error: 'Files are not available in secret chats yet' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload' });
    const retention = getSettings().fileRetentionDays;
    const name = req.file.originalname.slice(0, 255) || 'File';
    // An optional caption becomes the message text; without one the file name is shown.
    const caption = String(req.body?.caption ?? '').trim().slice(0, 4000);
    try {
      const message = await repo.addMessage(req.params.id, req.userId, {
        kind: 'file',
        body: caption || name,
        replyToId: req.body?.replyToId,
        attachment: {
          name,
          mimeType: safeMimeType(req.file.mimetype),
          size: req.file.size,
          path: req.file.filename,
          expiresAt: Date.now() + retention * 24 * 60 * 60 * 1000,
        },
      });
      await realtime.notifyMessage(message);
      res.status(201).json(message);
    } catch (error) {
      await deleteStoredFile(req.file.filename);
      throw error;
    }
  });

  r.get('/files/:messageId', async (req, res) => {
    await sendAttachment(res, await repo.getAttachment(req.params.messageId, req.userId));
  });

  // A short-lived signed link to a file I can see, for streaming it in a <video>.
  r.post('/files/:messageId/link', async (req, res) => {
    const attachment = await repo.getAttachment(req.params.messageId, req.userId);
    if (!attachment) return res.status(404).json({ error: 'File not found' });
    const { exp, sig } = signFileLink(req.params.messageId);
    res.json({ url: `/api/f/${req.params.messageId}?e=${exp}&s=${sig}` });
  });

  r.post('/conversations/:id/read', member, async (req, res) => {
    const readAt = await repo.markRead(req.params.id, req.userId);
    await realtime.notifyRead(req.params.id, req.userId, readAt);
    res.json({ readAt });
  });

  // ---------- groups: profile, members, roles ----------

  /** Writes a system message (rendered/translated by the clients) and pushes it live. */
  async function systemMessage(conversationId, actorId, payload) {
    const actor = await repo.getUserRow(actorId);
    const message = await repo.addMessage(conversationId, actorId, {
      kind: 'system',
      body: JSON.stringify({ ...payload, actor: actor?.display_name ?? '' }),
    });
    await realtime.notifyMessage(message);
  }

  /** Loads the group and the caller's role; rejects DMs, non-members and too-low roles. */
  const group = (minRole) => async (req, res, next) => {
    const conv = await repo.getConversationRow(req.params.id);
    const role = conv && (await repo.getRole(conv.id, req.userId));
    if (!conv || !role) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.type !== 'group' && conv.type !== 'channel') return res.status(400).json({ error: 'Only groups have members to manage' });
    if (repo.ROLE_RANK[role] < repo.ROLE_RANK[minRole]) return res.status(403).json({ error: 'Only group admins can do that' });
    req.group = conv;
    req.role = role;
    next();
  };

  // ---------- invite links ----------

  const inviteInfo = (conv) => ({ code: conv.invite_code ?? null });

  // The current link (admins and the owner can see it); code is null when there is none.
  r.get('/conversations/:id/invite', group('admin'), async (req, res) => res.json(inviteInfo(req.group)));

  // Creates the link if there is none (admins and the owner); 'reset' (owner only) swaps in a new code, which kills the old link.
  r.post('/conversations/:id/invite', group('admin'), async (req, res) => {
    const reset = req.body?.reset === true;
    if (reset && req.role !== 'owner') return res.status(403).json({ error: 'Only the owner can revoke the invite link' });
    let code = req.group.invite_code;
    if (!code || reset) {
      code = repo.newInviteCode();
      await repo.setInviteCode(req.group.id, code);
    }
    res.json({ code });
  });

  // Revokes the link for good; only the owner can.
  r.delete('/conversations/:id/invite', group('owner'), async (req, res) => {
    await repo.setInviteCode(req.group.id, null);
    res.json({ code: null });
  });

  // What a link leads to (shown before joining). Revoked or unknown codes look the same.
  r.get('/invite/:code', async (req, res) => {
    const conv = await repo.getConversationByInvite(req.params.code);
    if (!conv) return res.status(404).json({ error: 'This invite link is not valid anymore' });
    res.json({
      id: conv.id,
      type: conv.type,
      name: conv.name || '',
      description: conv.description ?? '',
      avatarUrl: conv.avatar_path ? `/api/avatars/${conv.avatar_path}` : null,
      memberCount: await repo.memberCount(conv.id),
      member: await repo.isMember(conv.id, req.userId),
    });
  });

  r.post('/invite/:code/join', async (req, res) => {
    const conv = await repo.getConversationByInvite(req.params.code);
    if (!conv) return res.status(404).json({ error: 'This invite link is not valid anymore' });
    const added = await repo.addMembers(conv.id, [req.userId]);
    if (added.length) {
      await systemMessage(conv.id, req.userId, { e: 'joined-link' });
      await realtime.notifyConversation(conv.id);
    }
    res.json(await repo.getConversation(conv.id, req.userId));
  });

  r.patch('/conversations/:id/info', group('admin'), async (req, res) => {
    const { name, description } = req.body || {};
    const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : undefined;
    if (nextName === '') return res.status(400).json({ error: 'Group name cannot be empty' });
    const nextDesc = typeof description === 'string' ? description.trim().slice(0, 500) : undefined;
    await repo.updateGroupInfo(req.group.id, { name: nextName, description: nextDesc });
    if (nextName && nextName !== req.group.name) await systemMessage(req.group.id, req.userId, { e: 'renamed', name: nextName });
    if (nextDesc !== undefined && nextDesc !== req.group.description) await systemMessage(req.group.id, req.userId, { e: 'description' });
    await realtime.notifyConversation(req.group.id);
    res.json(await repo.getConversation(req.group.id, req.userId));
  });

  r.put('/conversations/:id/avatar', group('admin'), async (req, res) => {
    let file;
    try {
      file = await saveAvatar(`g-${req.group.id}`, req.body?.data);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    await repo.setGroupAvatar(req.group.id, file);
    await deleteAvatar(req.group.avatar_path);
    await systemMessage(req.group.id, req.userId, { e: 'photo' });
    await realtime.notifyConversation(req.group.id);
    res.json(await repo.getConversation(req.group.id, req.userId));
  });

  r.delete('/conversations/:id/avatar', group('admin'), async (req, res) => {
    await repo.setGroupAvatar(req.group.id, null);
    await deleteAvatar(req.group.avatar_path);
    await realtime.notifyConversation(req.group.id);
    res.json(await repo.getConversation(req.group.id, req.userId));
  });

  r.post('/conversations/:id/members', group('admin'), async (req, res) => {
    const added = await repo.addMembers(req.group.id, Array.isArray(req.body?.userIds) ? req.body.userIds : []);
    if (!added.length) return res.status(400).json({ error: 'Those people are already in the group' });
    await systemMessage(req.group.id, req.userId, { e: 'added', targets: added.map((u) => u.display_name) });
    await realtime.notifyConversation(req.group.id);
    res.json(await repo.getConversation(req.group.id, req.userId));
  });

  // Remove someone (admins) or leave (anyone, with your own id).
  r.delete('/conversations/:id/members/:userId', group('member'), async (req, res) => {
    const targetId = req.params.userId;
    const leaving = targetId === req.userId;
    const targetRole = await repo.getRole(req.group.id, targetId);
    if (!targetRole) return res.status(404).json({ error: 'Not a member' });
    if (!leaving) {
      // Admins remove members; only the owner removes admins; nobody removes the owner.
      if (targetRole === 'owner' || repo.ROLE_RANK[req.role] <= repo.ROLE_RANK[targetRole] || req.role === 'member')
        return res.status(403).json({ error: 'You can’t remove this member' });
    }
    const target = await repo.getUserRow(targetId);
    await repo.removeMember(req.group.id, targetId);
    realtime.notifyRemoved(req.group.id, targetId);
    const stillExists = await repo.getConversationRow(req.group.id);
    if (stillExists) {
      await systemMessage(req.group.id, req.userId, leaving ? { e: 'left' } : { e: 'removed', targets: [target?.display_name ?? ''] });
      if (targetRole === 'owner') {
        const owner = await repo.ensureOwner(req.group.id);
        if (owner) await systemMessage(req.group.id, owner.id, { e: 'owner' });
      }
      await realtime.notifyConversation(req.group.id);
    }
    res.json({ ok: true });
  });

  // Owner only: make admin, back to member, or hand over ownership.
  r.patch('/conversations/:id/members/:userId', group('owner'), async (req, res) => {
    const { role } = req.body || {};
    const targetId = req.params.userId;
    if (!['admin', 'member', 'owner'].includes(role)) return res.status(400).json({ error: 'Unknown role' });
    if (targetId === req.userId) return res.status(400).json({ error: 'You can’t change your own role' });
    if (!(await repo.getRole(req.group.id, targetId))) return res.status(404).json({ error: 'Not a member' });
    const target = await repo.getUserRow(targetId);
    if (role === 'owner') {
      await repo.setRole(req.group.id, targetId, 'owner');
      await repo.setRole(req.group.id, req.userId, 'admin');
      await systemMessage(req.group.id, req.userId, { e: 'transferred', targets: [target.display_name] });
    } else {
      await repo.setRole(req.group.id, targetId, role);
      await systemMessage(req.group.id, req.userId, { e: role === 'admin' ? 'promoted' : 'demoted', targets: [target.display_name] });
    }
    await realtime.notifyConversation(req.group.id);
    res.json(await repo.getConversation(req.group.id, req.userId));
  });

  // ---------- calls ----------

  r.get('/calls', async (req, res) => res.json(await repo.listCalls(req.userId)));
  r.get('/calls/active', async (req, res) => res.json(await realtime.activeCalls(req.userId)));
  r.get('/calls/:callId/active', async (req, res) => {
    const call = await realtime.invitedCall(req.userId, req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call is no longer available' });
    res.json(call);
  });

  return r;
}
