// Server usage for the admin's "App settings": machine load, storage and what Flock holds.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UPLOAD_DIR } from './avatars.js';
import { now, one } from './db.js';
import { onlineCount } from './presence.js';

/** CPU busy share over a short window (all cores). */
async function cpuPercent(ms = 250) {
  const sample = () => os.cpus().reduce((acc, c) => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: acc.idle + c.times.idle, total: acc.total + total };
  }, { idle: 0, total: 0 });
  const a = sample();
  await new Promise((r) => setTimeout(r, ms));
  const b = sample();
  const total = b.total - a.total;
  return total > 0 ? Math.round((1 - (b.idle - a.idle) / total) * 1000) / 10 : 0;
}

async function folderBytes(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderBytes(full);
    else if (e.isFile()) total += (await fs.stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

async function version() {
  // Installed packages carry /opt/flock/VERSION next to the server folder.
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of [path.join(here, '..', '..', 'VERSION'), path.join(here, '..', 'VERSION')]) {
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    if (text) return text.split('\n')[0].trim();
  }
  return null;
}

export async function serverUsage(live) {
  const [cpu, disk, uploadsBytes, counts, ver] = await Promise.all([
    cpuPercent(),
    fs.statfs(UPLOAD_DIR).catch(() => null),
    folderBytes(UPLOAD_DIR),
    one(
      `SELECT pg_database_size(current_database()) AS db_bytes,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM conversations) AS conversations,
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COUNT(*) FROM messages WHERE attachment_path IS NOT NULL) AS files,
         (SELECT COUNT(*) FROM rooms WHERE closed_at IS NULL AND (expires_at IS NULL OR expires_at > $1)) AS rooms`,
      [now()],
    ),
    version(),
  ]);
  return {
    version: ver,
    cpu: { percent: cpu, cores: os.cpus().length, load: os.loadavg() },
    memory: { total: os.totalmem(), free: os.freemem(), flock: process.memoryUsage().rss },
    disk: disk ? { total: disk.blocks * disk.bsize, free: disk.bavail * disk.bsize } : null,
    storage: { uploads: uploadsBytes, database: Number(counts.db_bytes) },
    uptime: { system: Math.round(os.uptime()), flock: Math.round(process.uptime()) },
    counts: {
      users: Number(counts.users),
      online: onlineCount(),
      conversations: Number(counts.conversations),
      messages: Number(counts.messages),
      files: Number(counts.files),
      openRooms: Number(counts.rooms),
      ...live,
    },
  };
}
