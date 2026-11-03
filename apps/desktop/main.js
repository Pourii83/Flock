// Flock desktop: an Electron shell that serves the React Native Web build from an
// `app://flock` origin and grants it camera/mic/screen access for calls.
const { app, BrowserWindow, desktopCapturer, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB_ROOT = path.join(__dirname, 'web-dist');
const ORIGIN = 'app://flock';
const DEV = process.argv.includes('--dev');

// Server URL: FLOCK_SERVER_URL env > userData/config.json > localhost in --dev. Otherwise none,
// and the web build's own default (EXPO_PUBLIC_API_URL at build time) applies.
function serverUrl() {
  if (process.env.FLOCK_SERVER_URL) return process.env.FLOCK_SERVER_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    if (cfg.serverUrl) return cfg.serverUrl;
  } catch {}
  return DEV ? 'http://localhost:4000' : null;
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    let file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
    // Stay inside the bundle; unknown paths fall back to the SPA entry (client-side routing).
    if (!file.startsWith(WEB_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(WEB_ROOT, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function configurePermissions() {
  const ses = session.defaultSession;
  const trusted = (url) => typeof url === 'string' && url.startsWith(ORIGIN);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const allowed = ['media', 'notifications', 'clipboard-sanitized-write', 'display-capture'];
    callback(trusted(details.requestingUrl || wc.getURL()) && allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => trusted(origin) && ['media', 'notifications'].includes(permission));
  // getDisplayMedia(): share the primary screen, plus system audio when the call asks for it
  // (loopback capture is supported on Windows; elsewhere the share is video-only).
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (!sources[0]) return callback({});
    const withAudio = request.audioRequested && process.platform === 'win32';
    callback(withAudio ? { video: sources[0], audio: 'loopback' } : { video: sources[0] });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    title: 'Flock',
    backgroundColor: '#0B0E14',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: serverUrl() ? [`--flock-server=${serverUrl()}`] : [],
    },
  });
  win.once('ready-to-show', () => win.show());

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(`${ORIGIN}/`);
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
      console.error('web-dist/ is missing — run `npm run build:web` first.');
    }
    registerAppProtocol();
    configurePermissions();
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
