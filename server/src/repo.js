import { isUuid, newId, now, one, query, randomAvatarColor, tx } from './db.js';
import crypto from 'node:crypto';
import { isOnline } from './presence.js';

// ---------- users ----------

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    title: row.title,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_path ? `/api/avatars/${row.avatar_path}` : null,
    online: isOnline(row.id),
    lastSeen: row.last_seen,
  };
}

/** The signed-in user's own view of their account (adds what only they should know). */
export const selfUser = (row) => (row ? { ...publicUser(row), isAdmin: !!row.is_admin } : null);

export const getUserRow = (id) => (isUuid(id) ? one('SELECT * FROM users WHERE id = $1', [id]) : null);
export const getUserByUsername = (username) =>
  one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);

export async function createUser({ username, displayName, passwordHash }) {
  return one(
    `INSERT INTO users (id, username, display_name, password_hash, avatar_color, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [newId(), username, displayName, passwordHash, randomAvatarColor(), now()],
  );
}

export async function updateUser(id, { displayName, bio, title, username }) {
  return one(
    `UPDATE users SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio), title = COALESCE($4, title),
       username = COALESCE($5, username)
     WHERE id = $1 RETURNING *`,
    [id, displayName ?? null, bio ?? null, title ?? null, username ?? null],
  );
}

export const touchLastSeen = (id) => query('UPDATE users SET last_seen = $2 WHERE id = $1', [id, now()]);

// Escape LIKE wildcards so "_" and "%" in a query match literally.
const likeEscape = (text) => text.replace(/[\\%_]/g, '\\$&');

/** Directory search: only by a query of 3+ characters, so the user list can't be browsed. */
export const MIN_SEARCH = 3;
export async function searchUsers(meId, q) {
  const term = String(q || '').trim().replace(/^@/, '');
  if (term.length < MIN_SEARCH) return [];
  const rows = await query(
    `SELECT * FROM users WHERE id != $1 AND (username ILIKE $2 OR display_name ILIKE $2)
     ORDER BY (lower(username) = lower($3)) DESC, lower(display_name) LIMIT 50`,
    [meId, `%${likeEscape(term)}%`, term],
  );
  return rows.map(publicUser);
}

/** People I share a chat with (direct or group) — every call happens inside one of those chats. */
export async function contactUsers(meId, q) {
  const term = String(q || '').trim().replace(/^@/, '');
  const rows = await query(
    `SELECT u.* FROM users u
     WHERE u.id IN (
         SELECT other.user_id FROM members mine
         JOIN members other ON other.conversation_id = mine.conversation_id AND other.user_id != mine.user_id
         WHERE mine.user_id = $1)
       AND ($2 = '' OR u.username ILIKE $3 OR u.display_name ILIKE $3)
     ORDER BY lower(u.display_name) LIMIT 300`,
    [meId, term, `%${likeEscape(term)}%`],
  );
  return rows.map(publicUser);
}

export async function getPublicUsers(ids) {
  const valid = [...new Set(ids)].filter(isUuid);
  if (!valid.length) return [];
  return (await query('SELECT * FROM users WHERE id = ANY($1::uuid[])', [valid])).map(publicUser);
}

// ---------- conversations ----------

export const memberIds = async (conversationId) =>
  (await query('SELECT user_id FROM members WHERE conversation_id = $1', [conversationId])).map((r) => r.user_id);

export const isMember = async (conversationId, userId) =>
  isUuid(conversationId) &&
  !!(await one('SELECT 1 FROM members WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]));

export async function createConversation(meId, userIds, name, description = '', kind = 'group') {
  const candidates = [...new Set(userIds)].filter((id) => id !== meId && isUuid(id));
  const others = candidates.length
    ? (await query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [candidates])).map((r) => r.id)
    : [];
  // A channel can start with just its owner; subscribers are added later.
  if (others.length === 0 && kind !== 'channel') throw new Error('Pick at least one person');
  if (kind === 'channel' && !name) throw new Error('Give the channel a name');
  const type = kind === 'channel' ? 'channel' : others.length === 1 && !name ? 'direct' : 'group';
  if (type === 'direct') {
    const existing = await one(
      `SELECT c.id FROM conversations c
       JOIN members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
       JOIN members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
       WHERE c.type = 'direct' AND NOT c.secret`,
      [meId, others[0]],
    );
    if (existing) return { id: existing.id, created: false };
  }
  const id = newId();
  const t = now();
  await tx(async (client) => {
    await client.query(
      'INSERT INTO conversations (id, type, name, description, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, type, type !== 'direct' ? name || null : null, type !== 'direct' ? description.slice(0, 500) : '', meId, t],
    );
    for (const uid of [meId, ...others]) {
      await client.query(
        'INSERT INTO members (conversation_id, user_id, joined_at, last_read_at, role) VALUES ($1, $2, $3, $3, $4)',
        [id, uid, t, type !== 'direct' && uid === meId ? 'owner' : 'member'],
      );
    }
  });
  return { id, created: true };
}

const MESSAGE_SELECT = `
  SELECT m.*, r.body AS reply_body, r.sender_id AS reply_sender_id, ru.display_name AS reply_sender_name,
         su.display_name AS sender_name
  FROM messages m
  LEFT JOIN messages r ON r.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = r.sender_id
  LEFT JOIN users su ON su.id = m.sender_id`;

function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name ?? null,
    kind: row.kind,
    body: row.body,
    attachment: row.attachment_name
      ? {
          name: row.attachment_name,
          mimeType: row.attachment_mime || 'application/octet-stream',
          size: Number(row.attachment_size || 0),
          expiresAt: row.attachment_expires_at,
          expired: !row.attachment_path || row.attachment_expires_at <= now(),
          url: row.attachment_path && row.attachment_expires_at > now() ? `/api/files/${row.id}` : null,
        }
      : null,
    replyTo: row.reply_to_id
      ? { id: row.reply_to_id, body: row.reply_body, senderId: row.reply_sender_id, senderName: row.reply_sender_name }
      : null,
    forwardedFrom: row.forwarded_from ?? null,
    reactions: [],
    editedAt: row.edited_at ?? null,
    pinnedAt: row.pinned_at ?? null,
    createdAt: row.created_at,
  };
}

/** Conversations for `meId`, optionally restricted to one id. One round trip per query, no N+1. */
async function loadConversations(meId, onlyId) {
  const convs = await query(
    `SELECT c.*, me.last_read_at, me.pinned, me.muted, me.role AS my_role,
       ki.public_key AS secret_initiator_key, ki.user_id AS secret_initiator_user, kr.public_key AS secret_recipient_key,
       (SELECT COUNT(*) FROM messages x
          WHERE x.conversation_id = c.id AND x.created_at > me.last_read_at AND x.sender_id != $1) AS unread
     FROM conversations c
     JOIN members me ON me.conversation_id = c.id AND me.user_id = $1
     LEFT JOIN device_keys ki ON ki.id = c.secret_initiator_device
     LEFT JOIN device_keys kr ON kr.id = c.secret_recipient_device
     WHERE ($2::uuid IS NULL OR c.id = $2::uuid)`,
    [meId, onlyId ?? null],
  );
  if (convs.length === 0) return [];
  const ids = convs.map((c) => c.id);
  const [memberRows, lastRows] = await Promise.all([
    query(
      `SELECT m.conversation_id, m.last_read_at AS member_read_at, m.role AS member_role, m.joined_at AS member_joined_at, u.*
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ANY($1::uuid[])
       ORDER BY m.joined_at`,
      [ids],
    ),
    query(
      `SELECT DISTINCT ON (m.conversation_id) m.*, r.body AS reply_body, r.sender_id AS reply_sender_id,
         ru.display_name AS reply_sender_name
       FROM messages m
       LEFT JOIN messages r ON r.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = r.sender_id
       WHERE m.conversation_id = ANY($1::uuid[])
       ORDER BY m.conversation_id, m.created_at DESC`,
      [ids],
    ),
  ]);
  return convs.map((c) => {
    const members = memberRows.filter((m) => m.conversation_id === c.id);
    const others = members.filter((m) => m.id !== meId);
    const last = lastRows.find((m) => m.conversation_id === c.id);
    return {
      id: c.id,
      type: c.type,
      isSaved: !!c.saved,
      name:
        c.saved
          ? 'Saved Messages'
          : c.type === 'direct'
          ? others[0]?.display_name ?? 'Unknown'
          : c.name || others.map((o) => o.display_name).join(', '),
      members: members.map((m) => ({ ...publicUser(m), role: m.member_role })),
      description: c.description ?? '',
      // Secret chats: the two device keys messages are encrypted between (recipient set once accepted).
      secret: c.secret
        ? {
            initiatorUserId: c.secret_initiator_user ?? c.created_by,
            initiatorDeviceId: c.secret_initiator_device,
            initiatorKey: c.secret_initiator_key,
            recipientDeviceId: c.secret_recipient_device,
            recipientKey: c.secret_recipient_key,
          }
        : null,
      avatarUrl: c.avatar_path ? `/api/avatars/${c.avatar_path}` : null,
      myRole: c.my_role,
      lastMessage: serializeMessage(last),
      unreadCount: Number(c.unread),
      pinned: c.pinned,
      muted: c.muted,
      // Read receipts: the point every other member has read up to.
      othersReadAt: others.length ? Math.min(...others.map((m) => m.member_read_at)) : 0,
      createdAt: c.created_at,
      updatedAt: last?.created_at ?? c.created_at,
    };
  });
}

export const getConversation = async (id, meId) => (isUuid(id) ? (await loadConversations(meId, id))[0] ?? null : null);

export async function listConversations(meId) {
  const list = await loadConversations(meId);
  return list.sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);
}

export async function updateMembership(conversationId, meId, { pinned, muted }) {
  await query(
    `UPDATE members SET pinned = COALESCE($3, pinned), muted = COALESCE($4, muted)
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, meId, pinned ?? null, muted ?? null],
  );
}

export async function markRead(conversationId, meId) {
  const t = now();
  await query('UPDATE members SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2', [conversationId, meId, t]);
  return t;
}

// ---------- messages ----------

export async function listMessages(conversationId, { before, limit = 50 } = {}) {
  const rows = await query(
    `${MESSAGE_SELECT}
     WHERE m.conversation_id = $1 AND m.created_at < $2
     ORDER BY m.created_at DESC LIMIT $3`,
    [conversationId, Number(before) > 0 ? Number(before) : Number.MAX_SAFE_INTEGER, Math.min(Number(limit) || 50, 200)],
  );
  return withReactions(rows.reverse().map(serializeMessage));
}

/** One message in the normal client shape (reactions included), or null. */
export async function getMessage(messageId) {
  if (!isUuid(messageId)) return null;
  const row = await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [messageId]);
  if (!row) return null;
  return (await withReactions([serializeMessage(row)]))[0];
}

/** The sender changed the text: stores the new body and marks the message edited. */
export async function updateMessageBody(messageId, body) {
  const updated = await one('UPDATE messages SET body = $2, edited_at = $3 WHERE id = $1 RETURNING id', [messageId, body, now()]);
  return updated ? getMessage(updated.id) : null;
}

/** Removes a message; the caller deletes its stored file, if any. Returns the deleted row. */
export const deleteMessage = (messageId) => one('DELETE FROM messages WHERE id = $1 RETURNING *', [messageId]);

/** Pins (`on` true), unpins (false) or toggles (omitted) a message; returns its new pinnedAt. */
export async function setPinned(messageId, on) {
  const row = await one('SELECT pinned_at FROM messages WHERE id = $1', [messageId]);
  if (!row) return null;
  const want = on === undefined ? row.pinned_at == null : !!on;
  const pinnedAt = want ? now() : null;
  await query('UPDATE messages SET pinned_at = $2 WHERE id = $1', [messageId, pinnedAt]);
  return { messageId, pinnedAt };
}

/** Messages whose text or file name contains `q` (newest first). Excludes system/call noise. */
export async function searchMessages(conversationId, { q, before, limit = 50 } = {}) {
  const term = String(q || '').trim().slice(0, 200);
  if (!term) return [];
  const beforeMs = Number(before);
  const rows = await query(
    `${MESSAGE_SELECT}
     WHERE m.conversation_id = $1 AND m.created_at < $2 AND m.kind IN ('text', 'file')
       AND (m.body ILIKE $3 OR m.attachment_name ILIKE $3)
     ORDER BY m.created_at DESC LIMIT $4`,
    [conversationId, Number.isFinite(beforeMs) && beforeMs > 0 ? beforeMs : Number.MAX_SAFE_INTEGER, `%${likeEscape(term)}%`, Math.min(Number(limit) || 50, 50)],
  );
  return withReactions(rows.map(serializeMessage));
}

/** Pinned messages of a conversation, newest pin first. */
export async function listPinnedMessages(conversationId) {
  const rows = await query(
    `${MESSAGE_SELECT}
     WHERE m.conversation_id = $1 AND m.pinned_at IS NOT NULL
     ORDER BY m.pinned_at DESC LIMIT 200`,
    [conversationId],
  );
  return withReactions(rows.map(serializeMessage));
}

// ---------- reactions ----------

/** Fills in `reactions` ([{ emoji, userIds }], oldest first) for a batch of serialized messages. */
async function withReactions(messages) {
  if (!messages.length) return messages;
  const rows = await query(
    'SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id = ANY($1::uuid[]) ORDER BY created_at',
    [messages.map((m) => m.id)],
  );
  const byMessage = new Map();
  for (const r of rows) {
    const list = byMessage.get(r.message_id) ?? [];
    let entry = list.find((x) => x.emoji === r.emoji);
    if (!entry) list.push((entry = { emoji: r.emoji, userIds: [] }));
    entry.userIds.push(r.user_id);
    byMessage.set(r.message_id, list);
  }
  return messages.map((m) => ({ ...m, reactions: byMessage.get(m.id) ?? [] }));
}

export const getMessageRow = (id) => (isUuid(id) ? one('SELECT * FROM messages WHERE id = $1', [id]) : null);

/** Adds (`on`), removes, or toggles (`on` undefined) one reaction; returns the message's reactions. */
export async function setReaction(messageId, userId, emoji, on) {
  const had = !!(await one('SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, userId, emoji]));
  const want = on === undefined ? !had : !!on;
  if (want && !had)
    await query('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [messageId, userId, emoji, now()]);
  else if (!want && had)
    await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, userId, emoji]);
  return (await withReactions([{ id: messageId }]))[0].reactions;
}

// ---------- saved messages ----------

/** The user's "Saved Messages" conversation id, created on first use. */
export async function getOrCreateSaved(meId) {
  const find = () => one('SELECT id FROM conversations WHERE saved AND created_by = $1', [meId]);
  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  const id = newId();
  const t = now();
  try {
    await tx(async (client) => {
      await client.query(
        "INSERT INTO conversations (id, type, name, description, created_by, created_at, saved) VALUES ($1, 'direct', NULL, '', $2, $3, TRUE)",
        [id, meId, t],
      );
      await client.query("INSERT INTO members (conversation_id, user_id, joined_at, last_read_at, role) VALUES ($1, $2, $3, $3, 'member')", [id, meId, t]);
    });
    return { id, created: true };
  } catch (e) {
    // Lost a race against another request creating it (unique index on saved owner).
    if (e?.code !== '23505') throw e;
    return { id: (await find()).id, created: false };
  }
}

export async function addMessage(conversationId, senderId, { body, replyToId, kind = 'text', attachment = null, forwardedFrom = null }) {
  const id = newId();
  const t = now();
  const reply =
    isUuid(replyToId) &&
    (await one('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [replyToId, conversationId]))?.id;
  await query(
    `INSERT INTO messages
       (id, conversation_id, sender_id, kind, body, reply_to_id, created_at,
        attachment_name, attachment_mime, attachment_size, attachment_path, attachment_expires_at, forwarded_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      conversationId,
      senderId,
      kind,
      body,
      reply || null,
      t,
      attachment?.name ?? null,
      attachment?.mimeType ?? null,
      attachment?.size ?? null,
      attachment?.path ?? null,
      attachment?.expiresAt ?? null,
      forwardedFrom,
    ],
  );
  await query('UPDATE members SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2', [conversationId, senderId, t]);
  return serializeMessage(await one(`${MESSAGE_SELECT} WHERE m.id = $1`, [id]));
}

/** Returns an attachment only when the requesting user can read its conversation. */
export const getAttachment = (messageId, userId) =>
  isUuid(messageId)
    ? one(
        `SELECT m.attachment_name, m.attachment_mime, m.attachment_size, m.attachment_path, m.attachment_expires_at
         FROM messages m
         JOIN members x ON x.conversation_id = m.conversation_id AND x.user_id = $2
         WHERE m.id = $1 AND m.attachment_name IS NOT NULL`,
        [messageId, userId],
      )
    : null;

/** Detaches expired files atomically; the caller removes the returned paths from disk. */
export async function detachExpiredFiles(at = now()) {
  const rows = await query(
    `WITH expired AS (
       SELECT id, attachment_path
       FROM messages
       WHERE attachment_path IS NOT NULL AND attachment_expires_at <= $1
       FOR UPDATE
     )
     UPDATE messages m SET attachment_path = NULL
     FROM expired e
     WHERE m.id = e.id
     RETURNING e.attachment_path`,
    [at],
  );
  return rows.map((row) => row.attachment_path);
}

// ---------- calls ----------

export const createCall = (conversationId, callerId, video) =>
  one('INSERT INTO calls (id, conversation_id, caller_id, video, started_at) VALUES ($1, $2, $3, $4, $5) RETURNING *', [
    newId(),
    conversationId,
    callerId,
    !!video,
    now(),
  ]);

export const getCall = (id) => (isUuid(id) ? one('SELECT * FROM calls WHERE id = $1', [id]) : null);

export function setCallStatus(id, status) {
  if (status === 'active')
    return one("UPDATE calls SET status = 'active', answered_at = $2 WHERE id = $1 RETURNING *", [id, now()]);
  return one('UPDATE calls SET status = $2, ended_at = $3 WHERE id = $1 RETURNING *', [id, status, now()]);
}

export async function listCalls(meId) {
  const rows = await query(
    `SELECT c.* FROM calls c JOIN members m ON m.conversation_id = c.conversation_id AND m.user_id = $1
     WHERE c.status NOT IN ('ringing', 'active')
     ORDER BY c.started_at DESC LIMIT 100`,
    [meId],
  );
  const convs = new Map((await loadConversations(meId)).map((c) => [c.id, c]));
  return rows.map((c) => {
    const conv = convs.get(c.conversation_id);
    const outgoing = c.caller_id === meId;
    return {
      id: c.id,
      conversationId: c.conversation_id,
      title: conv?.name ?? 'Call',
      conversationType: conv?.type,
      peer: conv?.members.find((m) => m.id !== meId) ?? null,
      memberCount: conv?.members.length ?? 0,
      video: c.video,
      direction: outgoing ? 'outgoing' : 'incoming',
      missed: !outgoing && (c.status === 'missed' || c.status === 'declined'),
      status: c.status,
      startedAt: c.started_at,
      durationSec: c.answered_at && c.ended_at ? Math.round((c.ended_at - c.answered_at) / 1000) : 0,
    };
  });
}

export const setAvatarPath = (id, avatarPath) =>
  one('UPDATE users SET avatar_path = $2 WHERE id = $1 RETURNING *', [id, avatarPath]);

// ---------- groups ----------

export const ROLE_RANK = { member: 0, admin: 1, owner: 2 };

export const getRole = async (conversationId, userId) =>
  (await one('SELECT role FROM members WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]))?.role ?? null;

// ---------- invite links ----------

const INVITE_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const newInviteCode = () => crypto.randomBytes(12).toString('base64url');

/** Sets (or, with null, revokes) the conversation's invite code. */
export const setInviteCode = (conversationId, code) =>
  query('UPDATE conversations SET invite_code = $2 WHERE id = $1', [conversationId, code]);

/** The group or channel an invite code points at, or null when it never existed or was revoked. */
export const getConversationByInvite = (code) =>
  typeof code === 'string' && INVITE_RE.test(code)
    ? one("SELECT * FROM conversations WHERE invite_code = $1 AND type IN ('group', 'channel')", [code])
    : null;

export const memberCount = async (conversationId) =>
  Number((await one('SELECT COUNT(*) AS n FROM members WHERE conversation_id = $1', [conversationId]))?.n ?? 0);

export const getConversationRow = (id) => (isUuid(id) ? one('SELECT * FROM conversations WHERE id = $1', [id]) : null);

export const updateGroupInfo = (id, { name, description }) =>
  one('UPDATE conversations SET name = COALESCE($2, name), description = COALESCE($3, description) WHERE id = $1 RETURNING *', [
    id,
    name ?? null,
    description ?? null,
  ]);

export const setGroupAvatar = (id, avatarPath) =>
  one('UPDATE conversations SET avatar_path = $2 WHERE id = $1 RETURNING *', [id, avatarPath]);

/** Adds users that exist and aren't members yet; returns the added user rows. */
export async function addMembers(conversationId, userIds) {
  const ids = [...new Set(userIds)].filter(isUuid);
  if (!ids.length) return [];
  const rows = await query(
    `SELECT u.* FROM users u WHERE u.id = ANY($1::uuid[])
       AND NOT EXISTS (SELECT 1 FROM members m WHERE m.conversation_id = $2 AND m.user_id = u.id)`,
    [ids, conversationId],
  );
  const t = now();
  for (const u of rows) {
    await query(
      "INSERT INTO members (conversation_id, user_id, joined_at, last_read_at, role) VALUES ($1, $2, $3, $3, 'member') ON CONFLICT DO NOTHING",
      [conversationId, u.id, t],
    );
  }
  return rows;
}

export const removeMember = (conversationId, userId) =>
  query('DELETE FROM members WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);

export const setRole = (conversationId, userId, role) =>
  query('UPDATE members SET role = $3 WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId, role]);

/**
 * After the owner leaves: the earliest admin (else earliest member) becomes owner.
 * Deletes the conversation when nobody is left. Returns the new owner's user row, if any.
 */
export async function ensureOwner(conversationId) {
  const owner = await one("SELECT 1 FROM members WHERE conversation_id = $1 AND role = 'owner'", [conversationId]);
  if (owner) return null;
  const next = await one(
    `SELECT user_id FROM members WHERE conversation_id = $1
     ORDER BY (role = 'admin') DESC, joined_at, user_id LIMIT 1`,
    [conversationId],
  );
  if (!next) {
    await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
    return null;
  }
  await setRole(conversationId, next.user_id, 'owner');
  return getUserRow(next.user_id);
}

// ---------- meeting rooms ----------

const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');

export function publicRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    ownerId: row.owner_id,
    title: row.title,
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    closedAt: row.closed_at == null ? null : Number(row.closed_at),
  };
}

/** How a meeting guest appears to the others in the call. */
export const guestUser = (id, name) => ({
  id,
  username: '',
  displayName: name,
  bio: '',
  title: '',
  avatarColor: '#94A3B8',
  avatarUrl: null,
  online: true,
  lastSeen: null,
  guest: true,
});

/** Open = not closed by its owner and not past its expiry. */
export const roomIsOpen = (room) => !!room && !room.closedAt && (room.expiresAt == null || room.expiresAt > now());

export async function createRoom(ownerId, { title, expiresAt }) {
  return publicRoom(
    await one(
      `INSERT INTO rooms (id, code, owner_id, title, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newId(), roomCode(), ownerId, title, now(), expiresAt],
    ),
  );
}

export const getRoomByCode = async (code) => publicRoom(await one('SELECT * FROM rooms WHERE code = $1', [String(code)]));
export const getRoom = async (id) => (isUuid(id) ? publicRoom(await one('SELECT * FROM rooms WHERE id = $1', [id])) : null);

export async function listOpenRooms(ownerId) {
  const rows = await query(
    `SELECT * FROM rooms WHERE owner_id = $1 AND closed_at IS NULL AND (expires_at IS NULL OR expires_at > $2) ORDER BY created_at DESC`,
    [ownerId, now()],
  );
  return rows.map(publicRoom);
}

export async function closeRoom(id, ownerId) {
  if (!isUuid(id)) return null;
  return publicRoom(await one('UPDATE rooms SET closed_at = $3 WHERE id = $1 AND owner_id = $2 AND closed_at IS NULL RETURNING *', [id, ownerId, now()]));
}

// ---------- end-to-end encrypted ("secret") chats ----------

/** A Curve25519 public key, base64 (32 bytes). */
const isPublicKey = (k) => typeof k === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(k);

export async function registerDevice(userId, publicKey) {
  if (!isPublicKey(publicKey)) throw new Error('Invalid device key');
  const row = await one('INSERT INTO device_keys (id, user_id, public_key, created_at) VALUES ($1, $2, $3, $4) RETURNING id', [newId(), userId, publicKey, now()]);
  return row.id;
}

const ownsDevice = async (userId, deviceId) =>
  isUuid(deviceId) && !!(await one('SELECT 1 FROM device_keys WHERE id = $1 AND user_id = $2', [deviceId, userId]));

/** Always a new conversation: several secret chats with the same person can exist (one per device pair). */
export async function createSecretConversation(meId, otherId, deviceId) {
  if (!isUuid(otherId) || otherId === meId || !(await getUserRow(otherId))) throw new Error('Pick someone to chat with');
  if (!(await ownsDevice(meId, deviceId))) throw new Error('Invalid device key');
  const id = newId();
  const t = now();
  await tx(async (client) => {
    await client.query(
      `INSERT INTO conversations (id, type, name, description, created_by, created_at, secret, secret_initiator_device)
       VALUES ($1, 'direct', NULL, '', $2, $3, TRUE, $4)`,
      [id, meId, t, deviceId],
    );
    for (const uid of [meId, otherId]) {
      await client.query("INSERT INTO members (conversation_id, user_id, joined_at, last_read_at, role) VALUES ($1, $2, $3, $3, 'member')", [id, uid, t]);
    }
  });
  return id;
}

export const getSecretState = async (conversationId) =>
  isUuid(conversationId)
    ? one('SELECT secret, created_by, secret_initiator_device, secret_recipient_device FROM conversations WHERE id = $1', [conversationId])
    : null;

/** The other person picks the device this secret chat lives on. Only once. */
export async function acceptSecret(conversationId, meId, deviceId) {
  const state = await getSecretState(conversationId);
  if (!state?.secret || state.created_by === meId) throw new Error('Not a secret chat request');
  if (state.secret_recipient_device) throw new Error('This secret chat was accepted on another device');
  if (!(await ownsDevice(meId, deviceId))) throw new Error('Invalid device key');
  await query('UPDATE conversations SET secret_recipient_device = $2 WHERE id = $1 AND secret_recipient_device IS NULL', [conversationId, deviceId]);
}
