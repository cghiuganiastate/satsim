// Service Worker for caching the GLB model (robust, avoids install failures)
const CACHE_NAME = 'model-cache-v1';
const MODEL_URL = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/Gateway/Gateway%20Core.glb';

// Install: activate quickly but don't fail if caching can't complete
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil((async () => {
    await self.skipWaiting();
    console.log('Service Worker: skipWaiting completed');
  })());
});

// Activate: claim clients and clean old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    console.log('Service Worker: Old caches cleared');
    await self.clients.claim();
  })());
});

// Fetch: serve from cache first; if missing, fetch, cache if possible, then return
self.addEventListener('fetch', event => {
  // Only intercept the exact model URL to avoid interfering with other requests
  if (event.request.url === MODEL_URL) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) {
          console.log('Service Worker: Serving model from cache');
          return cached;
        }

        console.log('Service Worker: Fetching model from network');
        // Prefer CORS fetch; fallback to no-cors if CORS fails
        let response;
        try {
          response = await fetch(event.request, { mode: 'cors' });
        } catch (err) {
          console.warn('Service Worker: CORS fetch failed, trying no-cors', err);
          response = await fetch(event.request, { mode: 'no-cors' });
        }

        // If we got a valid response, attempt to cache it (clone first)
        if (response && (response.ok || response.type === 'opaque')) {
          try {
            await cache.put(event.request, response.clone());
            console.log('Service Worker: Model cached');
          } catch (cacheErr) {
            console.warn('Service Worker: Failed to cache model', cacheErr);
          }
        } else {
          console.warn('Service Worker: Network response invalid', response && response.status);
        }

        return response;
      } catch (err) {
        console.error('Service Worker: Fetch handler error', err);
        // As a fallback, try network directly
        return fetch(event.request).catch(e => new Response(null, { status: 504, statusText: 'Gateway Timeout' }));
      }
    })());
  }
});
