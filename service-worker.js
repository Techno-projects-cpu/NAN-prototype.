const CACHE_NAME = 'nezaad-player-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/state.js',
  './js/config.js',
  './js/utils.js',
  './js/subtitles.js',
  './js/equalizer.js',
  './js/filters.js',
  './js/playlist.js',
  './js/streaming.js',
  './js/player-core.js',
  './js/room.js',
  './js/voice.js',
  './js/chat.js',
  './js/shortcuts.js',
  './js/main.js',
  './assets/logo.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for cross-origin (e.g. streamed media, hls.js CDN); cache-first for the app shell.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).catch(() => cached)
    )
  );
});
