// The version the app reports, and the changelog of the installed release.
// Installed packages keep /opt/flock/VERSION and /opt/flock/RELEASE_NOTES.md next to server/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(HERE, '..');
// /opt/flock when installed; the repository checkout when running from source.
const APP_DIR = path.join(SERVER_DIR, '..');
const MAX_NOTES = 4000;

const readText = (file) => fs.readFile(file, 'utf8').catch(() => null);

/** The installed release tag (first line of /opt/flock/VERSION), else the server package version. */
export async function installedVersion() {
  for (const file of [path.join(APP_DIR, 'VERSION'), path.join(SERVER_DIR, 'VERSION')]) {
    const text = await readText(file);
    const line = text?.split('\n')[0]?.trim();
    if (line) return line;
  }
  try {
    return JSON.parse((await readText(path.join(SERVER_DIR, 'package.json'))) ?? '{}').version ?? null;
  } catch {
    return null;
  }
}

/** Release notes shipped with the installed build (empty when the package has none). */
export async function releaseNotes() {
  for (const file of [path.join(APP_DIR, 'RELEASE_NOTES.md'), path.join(SERVER_DIR, 'RELEASE_NOTES.md')]) {
    const text = await readText(file);
    if (text) return text.slice(0, MAX_NOTES);
  }
  return '';
}

/** Persian release notes (RELEASE_NOTES.fa.md), or '' when the package has no translation. */
export async function releaseNotesFa() {
  for (const file of [path.join(APP_DIR, 'RELEASE_NOTES.fa.md'), path.join(SERVER_DIR, 'RELEASE_NOTES.fa.md')]) {
    const text = await readText(file);
    if (text) return text.slice(0, MAX_NOTES);
  }
  return '';
}
