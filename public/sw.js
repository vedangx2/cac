/* public/sw.js
 *
 * The service worker. It does two jobs:
 *
 *   1. It makes the app work with no internet. This matters more than it might sound: a lot
 *      of the fields this would get used on have no usable signal. Once the app has been
 *      opened on a phone, it keeps working out there.
 *   2. Browsers require a service worker with a fetch handler before they will offer to
 *      install a site to the home screen.
 *
 * The strategy is NETWORK FIRST, falling back to the cache:
 *   • Online, you always get the current version — we never serve stale code to someone
 *     relying on this on a sideline.
 *   • Offline, you get the last copy that was successfully fetched.
 *
 * Deliberately simple. No background sync, no push, no precache manifest. Note that athlete
 * data is NOT involved here at all — that lives in IndexedDB, and none of it is ever sent
 * anywhere for this file to cache.
 */

// Bump this string to throw away every old cache after a deploy.
const CACHE_NAME = 'sideline-screen-v1';

self.addEventListener('install', (event) => {
  // Take over as soon as we're installed rather than waiting for every tab to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete caches left behind by previous versions.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever handle plain page/asset reads from our own origin. Anything else (a POST, a
  // cross-origin request, a chrome-extension:// URL) is passed straight through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        // Only cache a genuinely successful, non-opaque response. Caching an error page
        // would mean serving that error forever once the athlete goes offline.
        if (response && response.status === 200 && response.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }

        return response;
      } catch {
        // Offline (or the request failed) — fall back to whatever we saved last time.
        const cached = await caches.match(request);
        if (cached) return cached;

        // For a navigation with nothing cached, try the home page so the app shell can load
        // rather than showing the browser's dinosaur.
        if (request.mode === 'navigate') {
          const fallback = await caches.match('/');
          if (fallback) return fallback;
        }

        throw new Error('Offline and this request is not in the cache.');
      }
    })(),
  );
});
