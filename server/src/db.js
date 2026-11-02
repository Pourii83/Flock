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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;
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
