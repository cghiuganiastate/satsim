// Service Worker for caching the GLB model
const CACHE_NAME = 'model-cache-v1';
const MODEL_URL = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/Gateway/Gateway%20Core.glb';

// Install event - cache the model
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching model file');
        return cache.add(MODEL_URL);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache first
self.addEventListener('fetch', event => {
  // Only handle requests for our model file
  if (event.request.url === MODEL_URL) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            console.log('Service Worker: Serving from cache');
            return response;
          }
          console.log('Service Worker: Fetching from network');
          return fetch(event.request);
        })
    );
  }
});
