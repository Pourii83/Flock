import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'data/uploads');
export const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const MAX_BYTES = 5 * 1024 * 1024;

await fs.mkdir(AVATAR_DIR, { recursive: true });

/** Detects the real image type from its magic bytes; null if not an allowed image. */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Saves a base64 image and returns its file name. Throws a user-facing error when invalid.
 * `owner` prefixes the file name: a user id, or `g-<conversationId>` for group photos.
 */
export async function saveAvatar(owner, base64) {
  const data = Buffer.from(String(base64 || '').replace(/^data:[^,]*,/, ''), 'base64');
  if (!data.length) throw new Error('No image received');
  if (data.length > MAX_BYTES) throw new Error('Image is too large (max 5 MB)');
  const ext = sniff(data);
  if (!ext) throw new Error('Use a JPEG, PNG or WebP image');
  // Random name: URLs are unguessable and change on every upload (safe to cache forever).
  const file = `${owner}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(AVATAR_DIR, file), data);
  return file;
}

export async function deleteAvatar(file) {
  if (!file || file.includes('/') || file.includes('\\')) return;
  await fs.rm(path.join(AVATAR_DIR, file), { force: true });
}
