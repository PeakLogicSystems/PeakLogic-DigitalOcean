'use strict';

/** Shared sign-out for dashboard and standalone pages (/cmms, /io-map, …). */
(function (root) {
  function performSignOut() {
    const api = root.PeaklogicApi || root.api;
    const done = () => { root.location.href = '/login'; };
    if (api?.logout) {
      return Promise.resolve(api.logout()).catch(() => {}).finally(done);
    }
    done();
  }

  function bindSignOut(elOrId) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el || el.dataset.signOutBound === '1') return;
    el.dataset.signOutBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      performSignOut();
    });
  }

  root.PeaklogicSignOut = { bind: bindSignOut, perform: performSignOut };
})(typeof window !== 'undefined' ? window : globalThis);
