// In-memory attempt counters for sign-in and sign-up (one server process, so no shared store needed).
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

export const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';

/** Sends 429 with Retry-After when blocked; returns true if the request was answered. */
export function rejectIfBlocked(res, seconds) {
  if (!seconds) return false;
  res.set('Retry-After', String(seconds));
  res.status(429).json({ error: TOO_MANY, retryAfter: seconds });
  return true;
}
