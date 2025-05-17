
// Enhanced Service Worker for NeuroFlux
const APP_VERSION = '1.0.0';
const CACHE_NAME = `neuroflux-cache-v${APP_VERSION}`;
const OFFLINE_CACHE = 'neuroflux-offline-v1';
const RUNTIME_CACHE = 'neuroflux-runtime-v1';

// Pre-cached assets (adjust these to match your actual files)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/scripts/app.js',
  '/images/logo-192.png',
  '/images/logo-512.png',
  '/manifest.json',
  '/favicon.ico',
  '/sounds/click.mp3' // Example audio file
];

// Network-first then cache fallback routes
const NETWORK_FIRST_ROUTES = [
  /\/api\/.*/,     // API endpoints
  /\/profile\/.*/  // User profile data
];

// Cache-first routes
const CACHE_FIRST_ROUTES = [
  /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|mp3|woff2)$/,
];

// Offline fallback page
const OFFLINE_FALLBACK = '/offline.html';

// ========== Service Worker Lifecycle Events ========== //

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', APP_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Pre-cache static assets
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[Service Worker] Caching app shell');
          return cache.addAll(PRECACHE_ASSETS);
        }),
      
      // Cache offline fallback page
      caches.open(OFFLINE_CACHE)
        .then(cache => cache.add(new Request(OFFLINE_FALLBACK, { cache: 'reload' })))
    ])
    .then(() => {
      console.log('[Service Worker] Skip waiting on install');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version:', APP_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old caches that don't match current version
          if (cacheName !== CACHE_NAME && 
              cacheName !== RUNTIME_CACHE && 
              cacheName !== OFFLINE_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// ========== Fetch Event Handler ========== //

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET' || !url.origin.startsWith(self.location.origin)) {
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE_FALLBACK))
    );
    return;
  }

  // Network-first strategy for API routes
  for (const route of NETWORK_FIRST_ROUTES) {
    if (route.test(request.url)) {
      event.respondWith(
        networkFirstThenCache(request)
      );
      return;
    }
  }

  // Cache-first strategy for static assets
  for (const route of CACHE_FIRST_ROUTES) {
    if (route.test(request.url)) {
      event.respondWith(
        cacheFirstThenNetwork(request)
      );
      return;
    }
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => cachedResponse || fetch(request))
  );
});

// ========== Caching Strategies ========== //

function networkFirstThenCache(request) {
  return fetch(request)
    .then(networkResponse => {
      // Clone response to save to cache
      const clonedResponse = networkResponse.clone();
      caches.open(RUNTIME_CACHE)
        .then(cache => cache.put(request, clonedResponse));
      return networkResponse;
    })
    .catch(() => {
      return caches.match(request)
        .then(cachedResponse => cachedResponse || fallbackResponse(request));
    });
}

function cacheFirstThenNetwork(request) {
  return caches.match(request)
    .then(cachedResponse => {
      // Return cached response if available
      if (cachedResponse) {
        // Update cache in background
        fetch(request)
          .then(networkResponse => {
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, networkResponse));
          });
        return cachedResponse;
      }
      // Otherwise go to network
      return fetch(request)
        .then(networkResponse => {
          // Cache new response
          const clonedResponse = networkResponse.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(request, clonedResponse));
          return networkResponse;
        })
        .catch(() => fallbackResponse(request));
    });
}

function fallbackResponse(request) {
  if (request.headers.get('accept').includes('text/html')) {
    return caches.match(OFFLINE_FALLBACK);
  }
  return new Response('Offline content not available', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({ 'Content-Type': 'text/plain' })
  });
}

// ========== Background Sync ========== //

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-journal-entries') {
    console.log('[Service Worker] Background sync for journal entries');
    event.waitUntil(syncJournalEntries());
  }
});

async function syncJournalEntries() {
  // Implement your background sync logic here
  // Example: Sync locally saved journal entries with server
}

// ========== Push Notifications ========== //

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/images/logo-192.png',
    badge: '/images/logo-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clientList => {
        const url = event.notification.data.url;
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
