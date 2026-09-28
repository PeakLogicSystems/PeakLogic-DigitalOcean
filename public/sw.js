/*
 * PeakLogic service worker — installable PWA app shell.
 *
 * Strategy:
 *   - Navigations (HTML): network-first, fall back to the cached shell when offline.
 *   - Same-origin static assets (css/js/svg/png/fonts): stale-while-revalidate,
 *     keyed by full URL. Versioned "?v=" query strings act as natural cache busters.
 *   - Live data endpoints (/api, /health) and any non-GET/cross-origin request are
 *     never touched — they always go straight to the network so SCADA data stays live.
 */
'use strict';

const CACHE = 'mv-cache-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('mv-cache-') && k !== CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /\.(?:css|js|mjs|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|json)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept live data / server state.
  if (url.pathname.startsWith('/api') || url.pathname === '/health') return;

  // App shell navigations: network-first with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/'))),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) => cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })),
    );
  }
});
