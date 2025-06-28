const CACHE_VERSION = 'v1';
const PRECACHE_NAME = `freedomfly-precache-${CACHE_VERSION}`;
const RUNTIME_NAME  = `freedomfly-runtime-${CACHE_VERSION}`;

// List all the files to precache
const PRECACHE_URLS = [
  '/',                     // HTML shell
  '/offline.html',         // Offline fallback
  '/favicon/android-chrome-192x192.png',
  '/favicon/android-chrome-512x512.png',
  '/favicon/apple-touch-icon.png',
];

// Install event — precache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', event => {
  const currentCaches = [PRECACHE_NAME, RUNTIME_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (!currentCaches.includes(name)) {
            return caches.delete(name);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event — differentiate navigation, API, and static requests
self.addEventListener('fetch', event => {
  const { request } = event;

  // 1) Navigation requests — serve app shell or offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // If we get a valid response, update the cache for next time
          return caches.open(RUNTIME_NAME).then(cache => {
            cache.put(request, response.clone());
            return response;
          });
        })
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // 2) Same-origin CSS/JS/images — Stale-while-revalidate
  if (request.url.startsWith(self.location.origin) &&
      (request.destination === 'style' ||
       request.destination === 'script' ||
       request.destination === 'image')) {
    event.respondWith(
      caches.open(RUNTIME_NAME).then(cache =>
        cache.match(request).then(cachedResponse => {
          const networkFetch = fetch(request).then(networkResponse => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || networkFetch;
        })
      )
    );
    return;
  }

  // 3) API requests — Network first, fallback to cache
  if (request.url.startsWith('https://ipwho.is/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // cache a copy
          return caches.open(RUNTIME_NAME).then(cache => {
            cache.put(request, response.clone());
            return response;
          });
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4) Default: pass through
});
