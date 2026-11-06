// Creates the server's admin account, or makes an existing account admin and sets its password.
//
//   node src/create-admin.js <username> [display name]
//
// The password is read from stdin (one line), so it never shows up in the process list or shell
// history; at a terminal it is asked for without echo. Like every account, it is stored only as a
// bcrypt hash. Needs DATABASE_URL like the server itself.
import readline from 'node:readline';

import { hashPassword } from './auth.js';
import { migrate, pool, query } from './db.js';
import * as repo from './repo.js';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

async function readPassword(prompt) {
  if (!process.stdin.isTTY) {
    // Piped (the installer): the first line of stdin.
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.split('\n')[0] ?? '';
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Hide what is typed.
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) process.stdout.write(s);
    };
    process.stdout.write(prompt);
    rl.once('line', (line) => {
      rl.close();
      process.stdout.write('\n');
      resolve(line);
    });
  });
}

const [username, ...nameParts] = process.argv.slice(2);
if (!username || !USERNAME_RE.test(username)) {
  console.error('Usage: node src/create-admin.js <username> [display name]   (password on stdin)');
  console.error('Usernames are 3–24 letters, numbers, _ or .');
  process.exit(2);
}
const password = (await readPassword('Admin password: ')).replace(/\r$/, '');
if (password.length < 8) {
  console.error('The admin password must be at least 8 characters.');
  process.exit(2);
}

await migrate();
const passwordHash = await hashPassword(password);
const existing = await repo.getUserByUsername(username);
if (existing) {
  await query('UPDATE users SET password_hash = $2, is_admin = TRUE WHERE id = $1', [existing.id, passwordHash]);
  console.log(`Admin '${existing.username}' updated.`);
} else {
  const user = await repo.createUser({ username, displayName: nameParts.join(' ').trim().slice(0, 60) || username, passwordHash });
  await query('UPDATE users SET is_admin = TRUE WHERE id = $1', [user.id]);
  console.log(`Admin '${username}' created.`);
}
await pool.end();
