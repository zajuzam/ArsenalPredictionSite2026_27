/* Arsenal Predictor — service worker (PWA offline app shell) */
const CACHE = 'arsenal-predictor-v2';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs. Let Supabase / flagcdn / ESPN calls go straight to the network.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first, bypassing the HTTP cache ({ cache: 'no-store' }) so a fresh
  // deploy always lands and you never get a stale app.js against a new index.html.
  // Falls back to the cached copy only when the network is unavailable (offline).
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
