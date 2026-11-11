import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[flock] JWT_SECRET not set — using a random secret; sessions reset on restart.');
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
/**
 * Short-lived signed file links: a <video> element can't send an Authorization header, so the app asks
 * for one of these (after the normal membership check) and the browser then streams with Range requests.
 */
const fileSig = (messageId, exp) => crypto.createHmac('sha256', SECRET).update(`file:${messageId}:${exp}`).digest('base64url');
export function signFileLink(messageId, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: fileSig(messageId, exp) };
}
export function verifyFileLink(messageId, exp, sig) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000 || typeof sig !== 'string') return false;
  const want = Buffer.from(fileSig(messageId, expNum));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

export const signToken = (userId) => jwt.sign({ sub: userId }, SECRET, { expiresIn: '30d' });

/** Signed-in users only; guest tokens are refused everywhere except meeting-room signaling. */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.guest ? null : payload.sub;
  } catch {
    return null;
  }
}

/** A guest's pass into one meeting room: a random id, the name they typed, and the room. */
export const signGuestToken = ({ guestId, name, roomId }, expiresInSeconds) =>
  jwt.sign({ sub: guestId, guest: { name, roomId } }, SECRET, { expiresIn: Math.max(60, Math.floor(expiresInSeconds)) });

export function verifyGuestToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.guest ? { guestId: payload.sub, name: payload.guest.name, roomId: payload.guest.roomId } : null;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const userId = verifyToken(header.replace(/^Bearer /, ''));
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  req.userId = userId;
  next();
}
