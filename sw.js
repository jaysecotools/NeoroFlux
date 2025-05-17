const CACHE_NAME = 'neuroflux-v1';
const ASSETS = [
  '/', // assuming this HTML file is at the root
  // Add any other assets you want cached for offline use
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
