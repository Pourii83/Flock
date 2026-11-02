// Creates demo accounts (password: flock123) and a few conversations. Safe to re-run.
import { hashPassword } from './auth.js';
import { migrate, pool } from './db.js';
import * as repo from './repo.js';

const PEOPLE = [
  ['maya', 'Maya Lin', 'Creative Technologist', 'Building real-time communication tools & ultra-fluid workspaces.'],
  ['leo', 'Leo Park', 'Audio Engineer', 'Codecs, latency and good coffee.'],
  ['elena', 'Elena Rostova', 'VP Design', 'Glassmorphism enjoyer.'],
  ['marcus', 'Marcus Vance', 'Sound Designer', ''],
  ['tariq', 'Tariq Mansoor', 'Backend Lead', 'Ships on Fridays.'],
];

await migrate();
const password = await hashPassword('flock123');
const users = {};
for (const [username, displayName, title, bio] of PEOPLE) {
  let row = await repo.getUserByUsername(username);
  if (!row) row = await repo.createUser({ username, displayName, passwordHash: password });
  users[username] = await repo.updateUser(row.id, { title, bio });
}

const { id: dm, created } = await repo.createConversation(users.maya.id, [users.leo.id]);
if (created) {
  await repo.addMessage(dm, users.maya.id, { body: 'Hey! Can you send over the new call controls spec?' });
  await repo.addMessage(dm, users.leo.id, { body: 'Sure! Just finalized the amber accent states for the active call button.' });
  await repo.addMessage(dm, users.maya.id, { body: 'Love this look! The contrast is super sharp.' });
}
const group = await repo.createConversation(users.elena.id, [users.maya.id, users.leo.id, users.tariq.id], 'Product Design Flock');
if (group.created) {
  await repo.addMessage(group.id, users.elena.id, { body: 'Updated the video call tokens — have a look 👀' });
  await repo.addMessage(group.id, users.tariq.id, { body: 'Production build v2.4 deployed.' });
}

console.log(`Seeded ${PEOPLE.length} demo users (password "flock123"): ${PEOPLE.map((p) => p[0]).join(', ')}`);
await pool.end();
