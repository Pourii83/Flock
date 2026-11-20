// In-memory counters for sign-in, sign-up and per-user write rates (one server process, so no shared
// store needed).
// Fixed windows: a key that reaches `limit` hits is blocked until its window ends.

const limiters = [];

export function createLimiter({ limit, windowMs }) {
  const hits = new Map(); // key -> { count, resetAt }
  const entry = (key, now) => {
    const e = hits.get(key);
    if (e && e.resetAt > now) return e;
    hits.delete(key);
    return null;
  };
  const limiter = {
    /** Seconds until `key` may try again, or 0 if it isn't blocked. */
    blockedFor(key, now = Date.now()) {
      const e = entry(key, now);
      return e && e.count >= limit ? Math.ceil((e.resetAt - now) / 1000) : 0;
    },
    hit(key, now = Date.now()) {
      const e = entry(key, now);
      if (e) e.count += 1;
      else hits.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key) {
      hits.delete(key);
    },
    sweep(now = Date.now()) {
      for (const [key, e] of hits) if (e.resetAt <= now) hits.delete(key);
    },
  };
  limiters.push(limiter);
  return limiter;
}

// Drop expired counters so the maps don't grow without bound.
setInterval(() => limiters.forEach((l) => l.sweep()), 5 * 60 * 1000).unref();

const MINUTE = 60 * 1000;
const envInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Failed sign-ins per account: stops password guessing against one username. */
export const loginFailsPerUser = createLimiter({ limit: envInt('LOGIN_MAX_FAILS_PER_USER', 8), windowMs: 15 * MINUTE });
/** Failed sign-ins per address: generous, since a CDN or office NAT can put many people behind one IP. */
export const loginFailsPerIp = createLimiter({ limit: envInt('LOGIN_MAX_FAILS_PER_IP', 40), windowMs: 15 * MINUTE });
/** Sign-up attempts per address. */
export const registerPerIp = createLimiter({ limit: envInt('REGISTER_MAX_PER_IP', 10), windowMs: 60 * MINUTE });

// Signed-in use: generous for people, but a script can't flood chats, fill the disk or mint TURN
// credentials without end.
/** Any change (POST/PUT/PATCH/DELETE) per account. */
export const writesPerUser = createLimiter({ limit: envInt('WRITE_MAX_PER_MIN', 240), windowMs: MINUTE });
/** New messages and files per account. */
export const messagesPerUser = createLimiter({ limit: envInt('MESSAGE_MAX_PER_MIN', 60), windowMs: MINUTE });
/** File uploads per account. */
export const uploadsPerUser = createLimiter({ limit: envInt('UPLOAD_MAX_PER_HOUR', 200), windowMs: 60 * MINUTE });
/** New meeting links per account. */
export const roomsPerUser = createLimiter({ limit: envInt('ROOM_MAX_PER_HOUR', 30), windowMs: 60 * MINUTE });
/** ICE/TURN credential requests per account or meeting guest. */
export const icePerIdentity = createLimiter({ limit: envInt('ICE_MAX_PER_MIN', 60), windowMs: MINUTE });
/** Calls started per account. */
export const callsPerUser = createLimiter({ limit: envInt('CALL_MAX_PER_MIN', 20), windowMs: MINUTE });

export const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';
export const SLOW_DOWN = 'Too many requests. Please wait a moment and try again.';

/** Sends 429 with Retry-After when blocked; returns true if the request was answered. */
export function rejectIfBlocked(res, seconds, message = TOO_MANY) {
  if (!seconds) return false;
  res.set('Retry-After', String(seconds));
  res.status(429).json({ error: message, retryAfter: seconds });
  return true;
}

/** Counts one use of `key`; false (after answering 429) once its limit is used up. */
export function allow(limiter, key, res) {
  if (res && rejectIfBlocked(res, limiter.blockedFor(key), SLOW_DOWN)) return false;
  if (!res && limiter.blockedFor(key)) return false;
  limiter.hit(key);
  return true;
}

/** Express middleware: per signed-in user. */
export const throttle = (limiter) => (req, res, next) => {
  if (allow(limiter, req.userId, res)) next();
};
