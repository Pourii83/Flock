// Server-wide settings the admin changes from the app ("App settings"). Stored in the database;
// the environment only gives the first defaults.
import { query } from './db.js';

const envInt = (name, fallback) => {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? n : fallback;
};

/** name -> [default, validate(value) => cleaned value or undefined] */
const FIELDS = {
  allowRegistration: [process.env.ALLOW_REGISTRATION !== '0', (v) => (typeof v === 'boolean' ? v : undefined)],
  allowGuestMeetings: [true, (v) => (typeof v === 'boolean' ? v : undefined)],
  maxUploadMb: [envInt('MAX_UPLOAD_MB', 100), (v) => (Number.isInteger(v) && v >= 1 && v <= 4096 ? v : undefined)],
  fileRetentionDays: [envInt('FILE_RETENTION_DAYS', 7), (v) => (Number.isInteger(v) && v >= 1 && v <= 365 ? v : undefined)],
};

let current = Object.fromEntries(Object.entries(FIELDS).map(([k, [d]]) => [k, d]));

export const getSettings = () => current;

export async function loadSettings() {
  for (const { key, value } of await query('SELECT key, value FROM app_settings')) {
    const field = FIELDS[key];
    const clean = field?.[1](value);
    if (clean !== undefined) current = { ...current, [key]: clean };
  }
  return current;
}

/** Applies the valid fields of `patch`; throws on an invalid one so the admin sees why. */
export async function updateSettings(patch) {
  const next = {};
  for (const [key, value] of Object.entries(patch || {})) {
    const field = FIELDS[key];
    if (!field) continue;
    const clean = field[1](value);
    if (clean === undefined) throw new Error(`Invalid value for ${key}`);
    next[key] = clean;
  }
  for (const [key, value] of Object.entries(next)) {
    await query('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
  }
  current = { ...current, ...next };
  return current;
}
