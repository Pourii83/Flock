// Web Push: notifications that reach a browser or installed PWA even when Flock isn't open (the
// page's own notifications stop as soon as the phone puts the app to sleep). Each device registers
// a push subscription; for every new message the server sends a small, already-written notification
// to the recipients' devices through their browser's push service.
import webpush from 'web-push';

import { one, query, now } from './db.js';
import { MAIN_REPO_URL } from './settings.js';

let ready = false;
let publicKey = '';

/** Loads the server's VAPID key pair, creating it on first start (kept in the database). */
export async function initPush() {
  await query(`
    CREATE TABLE IF NOT EXISTS push_keys (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      -- Show the message text (off: only who wrote) and the language the notification is written in.
      preview BOOLEAN NOT NULL DEFAULT TRUE,
      lang TEXT NOT NULL DEFAULT 'en',
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
  `);
  let keys = await one('SELECT public_key, private_key FROM push_keys WHERE id = 1');
  if (!keys) {
    const made = webpush.generateVAPIDKeys();
    await query('INSERT INTO push_keys (id, public_key, private_key) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING', [made.publicKey, made.privateKey]);
    keys = await one('SELECT public_key, private_key FROM push_keys WHERE id = 1');
  }
  // The contact push services may use about this sender: the project's public page.
  webpush.setVapidDetails(MAIN_REPO_URL, keys.public_key, keys.private_key);
  publicKey = keys.public_key;
  ready = true;
}

export const pushPublicKey = () => publicKey;

const ENDPOINT_RE = /^https:\/\/[^\s]{10,1000}$/;

export async function subscribe(userId, sub, { preview = true, lang = 'en' } = {}) {
  const endpoint = String(sub?.endpoint ?? '');
  const p256dh = String(sub?.keys?.p256dh ?? '');
  const auth = String(sub?.keys?.auth ?? '');
  if (!ENDPOINT_RE.test(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) throw new Error('Invalid push subscription');
  await query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, preview, lang, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4, preview = $5, lang = $6`,
    [endpoint, userId, p256dh, auth, !!preview, lang === 'fa' ? 'fa' : 'en', now()],
  );
}

export const unsubscribe = (userId, endpoint) =>
  query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(endpoint ?? ''), userId]);

const WORDS = {
  en: { photo: 'Photo', video: 'Video', voice: 'Voice message', file: 'File', encrypted: 'Encrypted message', newMessage: 'New message', call: 'Incoming call', videoCall: 'Incoming video call', invite: 'Group call invitation' },
  fa: { photo: 'عکس', video: 'ویدیو', voice: 'پیام صوتی', file: 'فایل', encrypted: 'پیام رمزنگاری‌شده', newMessage: 'پیام تازه', call: 'تماس ورودی', videoCall: 'تماس تصویری ورودی', invite: 'دعوت به تماس گروهی' },
};

async function deliver(rows, build) {
  if (!ready) return;
  await Promise.all(
    rows.map(async (row) => {
      const payload = build(row);
      if (!payload) return;
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: payload.kind === 'call' ? 'high' : 'normal', topic: payload.topic },
        );
      } catch (error) {
        // The browser dropped this subscription (uninstalled, cleared, signed out): forget it.
        if (error?.statusCode === 404 || error?.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        else console.warn('[flock] push failed', error?.statusCode ?? '', error?.body ?? error?.message ?? error);
      }
    }),
  );
}

/** A new message: everyone else in the conversation who hasn't muted it gets a notification. */
export async function pushMessage(message) {
  if (!ready || !message) return;
  if (message.kind === 'system' || message.kind === 'call') return;
  const conv = await one('SELECT id, type, name, saved, secret FROM conversations WHERE id = $1', [message.conversationId]);
  if (!conv || conv.saved) return;
  const sender = await one('SELECT display_name FROM users WHERE id = $1', [message.senderId]);
  const rows = await query(
    `SELECT s.* FROM push_subscriptions s
     JOIN members m ON m.user_id = s.user_id AND m.conversation_id = $1
     WHERE s.user_id <> $2 AND NOT m.muted`,
    [conv.id, message.senderId],
  );
  if (!rows.length) return;
  const who = sender?.display_name ?? '';
  await deliver(rows, (row) => {
    const w = WORDS[row.lang] ?? WORDS.en;
    const mime = message.attachment?.mimeType ?? '';
    let text;
    if (conv.secret) text = w.encrypted;
    else if (message.kind === 'call_invite') text = w.invite;
    else if (message.kind === 'file')
      text = mime.startsWith('audio/') ? `🎤 ${w.voice}` : `${mime.startsWith('image/') ? `🖼 ${w.photo}` : mime.startsWith('video/') ? `🎬 ${w.video}` : `📎 ${w.file}`}${message.body && message.body !== message.attachment?.name ? `: ${message.body}` : ''}`;
    else text = message.body;
    const direct = conv.type === 'direct';
    const title = direct ? who : conv.name || who;
    const body = row.preview ? `${direct ? '' : `${who}: `}${text}` : direct ? w.newMessage : who;
    return { kind: 'message', conversationId: conv.id, title, body: String(body).slice(0, 180), tag: `chat-${conv.id}`, topic: `c${conv.id.replace(/-/g, '').slice(0, 30)}` };
  });
}

/** A call is ringing: the people it rings get a notification that opens the app. */
export async function pushCall({ callId, conversationId, userIds, callerName, video, title }) {
  if (!ready || !userIds?.length) return;
  const rows = await query('SELECT * FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [userIds]);
  await deliver(rows, (row) => {
    const w = WORDS[row.lang] ?? WORDS.en;
    return { kind: 'call', conversationId, callId, title: title || callerName, body: video ? w.videoCall : w.call, tag: `call-${callId}` };
  });
}
