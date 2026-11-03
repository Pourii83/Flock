import { isUuid, newId, now, one, query, randomAvatarColor, tx } from './db.js';
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

export async function updateUser(id, { displayName, bio, title }) {
  return one(
    `UPDATE users SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio), title = COALESCE($4, title)
     WHERE id = $1 RETURNING *`,
    [id, displayName ?? null, bio ?? null, title ?? null],
  );
}

export const touchLastSeen = (id) => query('UPDATE users SET last_seen = $2 WHERE id = $1', [id, now()]);

export async function searchUsers(meId, q) {
  const like = `%${q || ''}%`;
  const rows = await query(
    `SELECT * FROM users WHERE id != $1 AND (username ILIKE $2 OR display_name ILIKE $2)
     ORDER BY lower(display_name) LIMIT 100`,
    [meId, like],
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

export async function createConversation(meId, userIds, name, description = '') {
  const candidates = [...new Set(userIds)].filter((id) => id !== meId && isUuid(id));
  const others = candidates.length
    ? (await query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [candidates])).map((r) => r.id)
    : [];
  if (others.length === 0) throw new Error('Pick at least one person');
  const type = others.length === 1 && !name ? 'direct' : 'group';
  if (type === 'direct') {
    const existing = await one(
      `SELECT c.id FROM conversations c
       JOIN members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
       JOIN members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
       WHERE c.type = 'direct'`,
      [meId, others[0]],
    );
    if (existing) return { id: existing.id, created: false };
  }
  const id = newId();
  const t = now();
  await tx(async (client) => {
    await client.query(
      'INSERT INTO conversations (id, type, name, description, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, type, type === 'group' ? name || null : null, type === 'group' ? description.slice(0, 500) : '', meId, t],
    );
    for (const uid of [meId, ...others]) {
      await client.query(
        'INSERT INTO members (conversation_id, user_id, joined_at, last_read_at, role) VALUES ($1, $2, $3, $3, $4)',
        [id, uid, t, type === 'group' && uid === meId ? 'owner' : 'member'],
      );
    }
  });
  return { id, created: true };
}

const MESSAGE_SELECT = `
  SELECT m.*, r.body AS reply_body, r.sender_id AS reply_sender_id, ru.display_name AS reply_sender_name
  FROM messages m
  LEFT JOIN messages r ON r.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = r.sender_id`;

function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
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
    createdAt: row.created_at,
  };
}

/** Conversations for `meId`, optionally restricted to one id. One round trip per query, no N+1. */
async function loadConversations(meId, onlyId) {
  const convs = await query(
    `SELECT c.*, me.last_read_at, me.pinned, me.muted, me.role AS my_role,
       (SELECT COUNT(*) FROM messages x
          WHERE x.conversation_id = c.id AND x.created_at > me.last_read_at AND x.sender_id != $1) AS unread
     FROM conversations c
     JOIN members me ON me.conversation_id = c.id AND me.user_id = $1
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
      name:
        c.type === 'direct'
          ? others[0]?.display_name ?? 'Unknown'
          : c.name || others.map((o) => o.display_name).join(', '),
      members: members.map((m) => ({ ...publicUser(m), role: m.member_role })),
      description: c.description ?? '',
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
    [conversationId, before ? Number(before) : Number.MAX_SAFE_INTEGER, Math.min(Number(limit) || 50, 200)],
  );
  return rows.reverse().map(serializeMessage);
}

export async function addMessage(conversationId, senderId, { body, replyToId, kind = 'text', attachment = null }) {
  const id = newId();
  const t = now();
  const reply =
    isUuid(replyToId) &&
    (await one('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [replyToId, conversationId]))?.id;
  await query(
    `INSERT INTO messages
       (id, conversation_id, sender_id, kind, body, reply_to_id, created_at,
        attachment_name, attachment_mime, attachment_size, attachment_path, attachment_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
