import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { migrate, pool } from './db.js';
import { createRealtime } from './realtime.js';
import { createRouter } from './routes.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
// Optional: serve the built PWA from this process (used by the non-Docker install).
const WEB_DIR = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : null;
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

if (WEB_DIR && fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
  app.use(
    express.static(WEB_DIR, {
      index: false,
      setHeaders: (res, file) => {
        // Content-hashed bundles never change; everything else is revalidated.
        const immutable = file.includes(`${path.sep}_expo${path.sep}`);
        res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  // SPA fallback for client-side routes (/chat/123, /calls, ...).
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });
  console.log(`[flock] serving web app from ${WEB_DIR}`);
}
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

server.listen(PORT, HOST, () => console.log(`[flock] server listening on ${HOST}:${PORT}`));

const shutdown = () => {
  server.close();
  realtime.io.close();
  pool.end().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
