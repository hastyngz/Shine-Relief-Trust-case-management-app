/*
 * SHINE Relief Trust app-shell service worker.
 *
 * This file is a template. The build (vite.config.ts) substitutes the version
 * placeholder and the precache list, then emits the result as /sw.js:
 *   a build id that changes on every build
 *   a JSON array of same-origin URLs to precache
 *
 * It caches only the application shell (HTML, built JS/CSS, logos). It never
 * caches API calls, Firebase/Firestore/Auth traffic or storage download URLs,
 * because the data about each girl is sensitive and must always come from the
 * network or from the app's own offline queue.
 */
/* eslint-disable no-undef */
const CACHE_PREFIX = 'shine-shell-';
const CACHE_NAME = CACHE_PREFIX + '%VERSION%';
const PRECACHE_URLS = %PRECACHE%;

const NEVER_CACHE_PATTERNS = [
  /^\/api\//,
  /\/\/[^/]*googleapis\.com\//,
  /\/\/[^/]*firebaseio\.com\//,
  /\/\/[^/]*firebaseapp\.com\//,
  /\/\/[^/]*\.firebasestorage\.app\//,
  /\/\/[^/]*cloudflarestorage\.com\//,
  /\/\/[^/]*google-analytics\.com\//,
  /\/\/[^/]*googletagmanager\.com\//,
  /\/\/[^/]*gstatic\.com\/firebasejs\//,
];

function isNeverCached(url) {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.href) || pattern.test(url.pathname));
}

/** Only same-origin GET requests are ever cached. */
function isCacheableRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  return !isNeverCached(url);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response && response.ok) await cache.put(url, response);
      } catch (error) {
        // A single missing asset must not block the whole install.
        console.warn('[sw] could not precache', url, error);
      }
    }));
    // The new worker waits until the user accepts the update.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!isCacheableRequest(request, url)) return;

  // Navigations are network-first so a deploy is picked up, with the cached
  // shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Built assets are content-hashed, so cache-first is safe and fast.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
