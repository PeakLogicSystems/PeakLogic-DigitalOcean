/* Registers the PeakLogic service worker for installable/offline support. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (err) {
      console.warn('[pwa] service worker registration failed', err);
    });
  });
})();
