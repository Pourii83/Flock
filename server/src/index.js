import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { migrate, pool } from './db.js';
import { createRealtime } from './realtime.js';
import { createRouter } from './routes.js';

const PORT = Number(process.env.PORT || 4000);
// "*" (default) allows any origin — needed for the desktop (app://) and mobile apps.
const rawOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
const CORS_ORIGIN = rawOrigins.includes('*') ? '*' : rawOrigins;

await migrate();

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '64kb' }));

const server = http.createServer(app);
const realtime = createRealtime(server, CORS_ORIGIN);

app.use('/api', createRouter(realtime));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

server.listen(PORT, () => console.log(`[flock] server listening on :${PORT}`));

const shutdown = () => {
  server.close();
  realtime.io.close();
  pool.end().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
