const CACHE_NAME = 'aura-cache-v3';

const STATIC_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/assets/icons/icon-180.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/css/main.css',
  '/css/library.css',
  '/css/details.css',
  '/css/player.css',
  '/css/now_playing.css',
  '/css/collections.css',
  '/css/equalizer.css',
  '/css/settings.css',
  '/css/upload.css',
  '/css/epub_reader.css',
  '/css/auth.css',
  '/css/popout.css',
  '/css/variables.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/config.js',
  '/js/data.js',
  '/js/details.js',
  '/js/epub_reader.js',
  '/js/equalizer.js',
  '/js/favorites.js',
  '/js/library.js',
  '/js/now_playing.js',
  '/js/player.js',
  '/js/popout.js',
  '/js/popout_standalone.js',
  '/js/progress.js',
  '/js/router.js',
  '/js/settings.js',
  '/js/setup.js',
  '/js/upload.js'
];

// Install: Cache essential shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL_ASSETS).catch((err) => {
        console.warn('[Aura SW] Cache pre-fill partial notice:', err);
      });
    })
  );
});

// Activate: Prune stale cache generations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy dispatcher
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Audio stream and Range requests MUST bypass Service Worker
  // Safari / iOS audio subsystem requires direct HTTP 206 stream handling
  if (
    request.headers.get('range') ||
    url.pathname.includes('/file') ||
    request.destination === 'audio' ||
    request.destination === 'video'
  ) {
    return;
  }

  // 2. Dynamic Backend APIs: Network Only (do not cache dynamic JSON/user sessions)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. SPA Navigations: Return index.html from cache or network
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 4. Static Shell Assets (CSS, JS, Icons): Network-First to guarantee instant updates
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          request.method === 'GET' &&
          !url.pathname.startsWith('/api/')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
