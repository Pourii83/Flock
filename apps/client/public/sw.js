// Flock service worker: offline app shell, network-first for navigations,
// cache-first for hashed static assets. API and socket traffic is never cached.
//
// The whole app is precached, not just what the first visit happened to load: route chunks
// (/_expo/static/js/web/<route>-<hash>.js) and fonts are only requested when a screen needs them,
// so an installed PWA opened offline would otherwise get a blank page. The list is found by
// reading index.html and the bundles it loads, so it follows each build without a manifest.
const CACHE = 'flock-v3';
const SHELL = ['/', '/manifest.json', '/favicon.png', '/icon-192.png', '/icon-512.png'];
const NAV_TIMEOUT_MS = 4000;

const isStatic = (path) => path.startsWith('/_expo/') || path.startsWith('/assets/');
/** A real file, not the single-page fallback (hosts answer unknown paths with index.html). */
const isFile = (res) => res.ok && !(res.headers.get('content-type') || '').includes('text/html');

/** Every static file the app can ask for, starting from the given index.html text. */
async function appFiles(html) {
  const found = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) if (isStatic(m[1])) found.add(m[1]);
  const queue = [...found].filter((p) => p.endsWith('.js'));
  const seen = new Set();
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    let text;
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue;
    }
    for (const m of text.matchAll(/["']\/?(_expo\/static\/js\/[A-Za-z0-9_@().\/\[\]-]+\.js|assets\/[A-Za-z0-9_@().\/%+-]+\.[a-z0-9]{2,5})["']/g)) {
      const p = '/' + m[1];
      if (found.has(p)) continue;
      found.add(p);
      if (p.endsWith('.js')) queue.push(p);
    }
  }
  return found;
}

/** Caches every file of the build behind `html`, then drops files of older builds. */
async function precache(html) {
  const cache = await caches.open(CACHE);
  const files = await appFiles(html);
  await Promise.all(
    [...files].map(async (path) => {
      if (await cache.match(path)) return;
      try {
        const res = await fetch(path);
        if (isFile(res)) await cache.put(path, res);
      } catch {}
    }),
  );
  if (files.size) {
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (isStatic(path) && !files.has(path)) await cache.delete(req);
    }
  }
}

async function precacheFromNetwork() {
  const res = await fetch('/', { cache: 'no-cache' });
  if (!res.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put('/', res.clone());
  await precache(await res.text());
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => precacheFromNetwork().catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** The network answer, or null if it fails or takes too long (a weak signal looks like no signal). */
function fetchWithin(req, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    fetch(req)
      .then((res) => resolve(res))
      .catch(() => resolve(null))
      .finally(() => clearTimeout(timer));
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  if (req.mode === 'navigate') {
    // Single-page app: every route is index.html, so the cached '/' serves any path offline.
    const network = fetch(req);
    // Cloned before the page can read the body; the copy refreshes the cache below.
    const forCache = network.then((res) => res.clone());
    forCache.catch(() => {});
    event.respondWith(
      (async () => {
        const cached = await caches.match('/');
        const res = cached ? await fetchWithin(network, NAV_TIMEOUT_MS) : await network.catch(() => null);
        return res || cached || Response.error();
      })(),
    );
    // A fresh page may belong to a new build: keep '/' and the build's files current in the background.
    event.waitUntil(
      forCache
        .then(async (res) => {
          if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return;
          const cache = await caches.open(CACHE);
          await cache.put('/', res.clone());
          await precache(await res.text());
        })
        .catch(() => {}),
    );
    return;
  }

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (isFile(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
