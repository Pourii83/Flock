import pg from 'pg';
import crypto from 'node:crypto';

// BIGINT (epoch ms timestamps, counts) -> JS number
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://flock:flock@localhost:5433/flock',
  max: Number(process.env.PG_POOL_SIZE || 10),
});

export const query = async (text, params) => (await pool.query(text, params)).rows;
export const one = async (text, params) => (await pool.query(text, params)).rows[0];

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      last_seen BIGINT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
      name TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at BIGINT NOT NULL,
      last_read_at BIGINT NOT NULL DEFAULT 0,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS members_user ON members (user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL,
      reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_conv_time ON messages (conversation_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS calls (
      id UUID PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'ringing',
      started_at BIGINT NOT NULL,
      answered_at BIGINT,
      ended_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS calls_conv ON calls (conversation_id, started_at DESC);

    -- Meeting rooms: a link anyone can open, even without an account, until it expires or its owner closes it.
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      expires_at BIGINT,
      closed_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS rooms_owner ON rooms (owner_id, created_at DESC);

    -- The server's admin account(s), created by the installer (create-admin.js).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
    -- Server-wide settings changed by the admin in the app (see settings.js).
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    -- End-to-end encrypted ("secret") direct chats. Each device makes its own key pair and only the
    -- public half is stored here. A secret chat is bound to one device on each side.
    CREATE TABLE IF NOT EXISTS device_keys (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS device_keys_user ON device_keys (user_id);
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS secret BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS secret_initiator_device UUID REFERENCES device_keys(id) ON DELETE SET NULL;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS secret_recipient_device UUID REFERENCES device_keys(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;

    -- Groups: profile and roles (owner = "mother admin", admin, member)
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_path TEXT;
    ALTER TABLE members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

    -- Original, temporary chat attachments. The message remains after the bytes expire.
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_path TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_expires_at BIGINT;
    CREATE INDEX IF NOT EXISTS messages_attachment_expiry
      ON messages (attachment_expires_at) WHERE attachment_path IS NOT NULL;
    -- Saved Messages: a personal conversation with a single member (lazily created, one per user).
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_saved_owner ON conversations (created_by) WHERE saved;
    -- Display name of the original sender, set on messages copied into Saved Messages or forwarded.
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from TEXT;
    -- Channels (Telegram-style broadcast): like groups, but only admins and the owner post.
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'conversations_type_check' AND pg_get_constraintdef(oid) LIKE '%channel%'
      ) THEN
        ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
        ALTER TABLE conversations ADD CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group', 'channel'));
      END IF;
    END $$;
    -- Editing: when the sender last changed the text (NULL = never edited).
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at BIGINT;
    -- Pinning: when the message was pinned in its conversation (NULL = not pinned).
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at BIGINT;
    CREATE INDEX IF NOT EXISTS messages_pinned
      ON messages (conversation_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;
    -- Emoji reactions (plaintext metadata, so they work in end-to-end encrypted chats too).
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );
    -- Existing groups: the creator (or, if they left, the earliest member) becomes the owner.
    UPDATE members m SET role = 'owner'
    FROM (
      SELECT DISTINCT ON (c.id) c.id AS conversation_id, mm.user_id
      FROM conversations c JOIN members mm ON mm.conversation_id = c.id
      WHERE c.type IN ('group', 'channel') AND NOT EXISTS (SELECT 1 FROM members o WHERE o.conversation_id = c.id AND o.role = 'owner')
      ORDER BY c.id, (mm.user_id = c.created_by) DESC, mm.joined_at
    ) pick
    WHERE m.conversation_id = pick.conversation_id AND m.user_id = pick.user_id;
  `);
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();

const AVATAR_COLORS = ['#FFB84D', '#4EDEA3', '#7C9CFF', '#FF8A80', '#C792EA', '#64D2FF', '#F5C26B', '#9AE6B4'];
export const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
