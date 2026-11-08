import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';

import { UPLOAD_DIR } from './avatars.js';

export const FILE_DIR = path.join(UPLOAD_DIR, 'files');
import { getSettings } from './settings.js';
export const safeMimeType = (value) => (/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(String(value || '')) ? value : 'application/octet-stream');

await fs.mkdir(FILE_DIR, { recursive: true });

const safeExtension = (name) => {
  const ext = path.extname(String(name || '')).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '';
};

const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, FILE_DIR),
  // Keep the original bytes, but never trust a client-provided path or file name on disk.
  filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${safeExtension(file.originalname)}`),
});

// The limit is the admin's current setting, read for every upload.
const upload = (req, res, done) => multer({ storage, limits: { fileSize: getSettings().maxUploadMb * 1024 * 1024, files: 1 } }).single('file')(req, res, done);

/** Multer middleware with stable user-facing errors for size and malformed uploads. */
export function receiveFile(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'File is too large' : 'File upload failed' });
  });
}

export async function deleteStoredFile(file) {
  if (!file || path.basename(file) !== file) return;
  await fs.rm(path.join(FILE_DIR, file), { force: true });
}

export const storedFilePath = (file) => (file && path.basename(file) === file ? path.join(FILE_DIR, file) : null);

/** Copies a stored upload to a new file (so a saved copy has its own lifetime); returns the new name, or null. */
export async function copyStoredFile(file) {
  const from = storedFilePath(file);
  if (!from) return null;
  const name = `${crypto.randomUUID()}${safeExtension(file)}`;
  try {
    await fs.copyFile(from, path.join(FILE_DIR, name));
    return name;
  } catch {
    return null;
  }
}

