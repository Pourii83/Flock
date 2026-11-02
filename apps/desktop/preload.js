// Exposes the configured server URL to the web app (read by src/lib/config.ts).
const { contextBridge } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--flock-server='));

contextBridge.exposeInMainWorld('flockDesktop', {
  apiUrl: arg ? arg.slice('--flock-server='.length) : 'http://localhost:4000',
  platform: process.platform,
});
