import { Router } from 'express';
import crypto from 'node:crypto';
import { checkPassword, hashPassword, requireAuth, signToken } from './auth.js';
import { deleteAvatar, saveAvatar } from './avatars.js';
import { deleteStoredFile, receiveFile, safeMimeType, storedFilePath } from './files.js';
import * as repo from './repo.js';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export function createRouter(realtime) {
  const r = Router();

  r.get('/health', (_req, res) => res.json({ ok: true }));

  // ---------- auth ----------

  r.post('/auth/register', async (req, res) => {
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
    res.status(201).json({ token: signToken(user.id), user: repo.publicUser(user) });
  });

  r.post('/auth/login', async (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const user = await repo.getUserByUsername(String(username));
    if (!user || !(await checkPassword(String(password), user.password_hash)))
      return res.status(401).json({ error: 'Wrong username or password' });
    res.json({ token: signToken(user.id), user: repo.publicUser(user) });
  });

  r.use(requireAuth);

  // ---------- profile & people ----------

  r.get('/me', async (req, res) => {
    const user = await repo.getUserRow(req.userId);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json(repo.publicUser(user));
  });

  r.patch('/me', async (req, res) => {
    const { displayName, bio, title } = req.body || {};
    const user = repo.publicUser(
      await repo.updateUser(req.userId, {
        displayName: displayName?.trim()?.slice(0, 60) || undefined,
        bio: bio?.slice(0, 280),
        title: title?.slice(0, 60),
      }),
    );
    realtime.broadcastUser(user);
    res.json(user);
  });

  r.put('/me/avatar', async (req, res) => {
    let file;
    try {
      file = await saveAvatar(req.userId, req.body?.data);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const previous = (await repo.getUserRow(req.userId))?.avatar_path;
    const user = repo.publicUser(await repo.setAvatarPath(req.userId, file));
    await deleteAvatar(previous);
    realtime.broadcastUser(user);
    res.json(user);
  });

  r.delete('/me/avatar', async (req, res) => {
    const previous = (await repo.getUserRow(req.userId))?.avatar_path;
    const user = repo.publicUser(await repo.setAvatarPath(req.userId, null));
    await deleteAvatar(previous);
    realtime.broadcastUser(user);
    res.json(user);
  });

  r.get('/users', async (req, res) => res.json(await repo.searchUsers(req.userId, req.query.q)));

  r.get('/users/:id', async (req, res) => {
    const user = repo.publicUser(await repo.getUserRow(req.params.id));
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  });

  // ---------- conversations ----------

  r.get('/conversations', async (req, res) => res.json(await repo.listConversations(req.userId)));

  r.post('/conversations', async (req, res) => {
    const { userIds = [], name, description } = req.body || {};
    try {
      const groupName = typeof name === 'string' ? name.trim().slice(0, 80) : undefined;
      const { id, created } = await repo.createConversation(req.userId, userIds, groupName, typeof description === 'string' ? description.trim() : '');
      if (created) {
        await realtime.notifyConversation(id);
        if (groupName) await systemMessage(id, req.userId, { e: 'created', name: groupName });
      }
      res.status(created ? 201 : 200).json(await repo.getConversation(id, req.userId));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  const member = async (req, res, next) => {
    if (!(await repo.isMember(req.params.id, req.userId))) return res.status(404).json({ error: 'Conversation not found' });
    next();
  };

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

  r.post('/conversations/:id/messages', member, async (req, res) => {
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ error: 'Message is empty' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message is too long' });
    const message = await repo.addMessage(req.params.id, req.userId, { body, replyToId: req.body?.replyToId });
    await realtime.notifyMessage(message);
    res.status(201).json(message);
  });

  r.post('/conversations/:id/files', member, receiveFile, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload' });
    const retention = Math.max(1, Number.parseInt(process.env.FILE_RETENTION_DAYS || '7', 10) || 7);
    try {
      const message = await repo.addMessage(req.params.id, req.userId, {
        kind: 'file',
        body: req.file.originalname.slice(0, 255) || 'File',
        replyToId: req.body?.replyToId,
        attachment: {
          name: req.file.originalname.slice(0, 255) || 'File',
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
    const attachment = await repo.getAttachment(req.params.messageId, req.userId);
    if (!attachment) return res.status(404).json({ error: 'File not found' });
    if (!attachment.attachment_path || attachment.attachment_expires_at <= Date.now()) {
      if (attachment.attachment_path) await deleteStoredFile(attachment.attachment_path);
      return res.status(410).json({ error: 'File expired' });
    }
    const file = storedFilePath(attachment.attachment_path);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', attachment.attachment_mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(attachment.attachment_size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Uploaded HTML/SVG must never run as the app's origin, even when opened directly.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.attachment_name)}`);
    res.sendFile(file);
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
    if (conv.type !== 'group') return res.status(400).json({ error: 'Only groups have members to manage' });
    if (repo.ROLE_RANK[role] < repo.ROLE_RANK[minRole]) return res.status(403).json({ error: 'Only group admins can do that' });
    req.group = conv;
    req.role = role;
    next();
  };

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

  // ICE servers for WebRTC. TURN credentials are short-lived (TURN REST API, coturn
  // "use-auth-secret"), so the shared secret never reaches clients.
  r.get('/ice', (req, res) => {
    const iceServers = [{ urls: process.env.STUN_URLS?.split(',') ?? ['stun:stun.l.google.com:19302'] }];
    // TURN_EXTRA_URLS: other relays sharing the secret (e.g. eturnal on another server), tried first.
    const turnUrls = [process.env.TURN_EXTRA_URLS, process.env.TURN_URLS]
      .flatMap((v) => v?.split(',') ?? [])
      .map((u) => u.trim())
      .filter(Boolean);
    if (turnUrls.length && process.env.TURN_SECRET) {
      const ttl = 12 * 3600;
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${req.userId}`;
      const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }
    // TURN_RELAY_ONLY=1 sends all call media through the relay (hides users' IPs, steadier calls).
    const relayOnly = process.env.TURN_RELAY_ONLY === '1' && iceServers.length > 1;
    res.json({ iceServers, ...(relayOnly ? { iceTransportPolicy: 'relay' } : {}) });
  });


  r.get('/calls', async (req, res) => res.json(await repo.listCalls(req.userId)));
  r.get('/calls/active', async (req, res) => res.json(await realtime.activeCalls(req.userId)));
  r.get('/calls/:callId/active', async (req, res) => {
    const call = await realtime.invitedCall(req.userId, req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call is no longer available' });
    res.json(call);
  });

  return r;
}
