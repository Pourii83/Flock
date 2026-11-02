import { Router } from 'express';
import crypto from 'node:crypto';
import { checkPassword, hashPassword, requireAuth, signToken } from './auth.js';
import { deleteAvatar, saveAvatar } from './avatars.js';
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
    const { userIds = [], name } = req.body || {};
    try {
      const { id, created } = await repo.createConversation(req.userId, userIds, name?.trim());
      if (created) await realtime.notifyConversation(id);
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

  r.post('/conversations/:id/read', member, async (req, res) => {
    const readAt = await repo.markRead(req.params.id, req.userId);
    await realtime.notifyRead(req.params.id, req.userId, readAt);
    res.json({ readAt });
  });

  // ---------- calls ----------

  // ICE servers for WebRTC. TURN credentials are short-lived (TURN REST API, coturn
  // "use-auth-secret"), so the shared secret never reaches clients.
  r.get('/ice', (req, res) => {
    const iceServers = [{ urls: process.env.STUN_URLS?.split(',') ?? ['stun:stun.l.google.com:19302'] }];
    const turnUrls = process.env.TURN_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
    if (turnUrls?.length && process.env.TURN_SECRET) {
      const ttl = 12 * 3600;
      const username = `${Math.floor(Date.now() / 1000) + ttl}:${req.userId}`;
      const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    }
    res.json({ iceServers });
  });


  r.get('/calls', async (req, res) => res.json(await repo.listCalls(req.userId)));

  return r;
}
