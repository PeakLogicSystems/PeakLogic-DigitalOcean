/*
 * Live HMI zoom controls (mobile readability / tap-target access).
 * Delegates to HmiView.setLiveDisplayZoom, which enlarges the live screen using
 * real layout so text stays crisp and buttons grow to a tappable size while the
 * viewport scrolls/pans.
 */
(function () {
  'use strict';

  var STEP = 1.4;
  var MIN = 1;
  var MAX = 4;

  function clamp(z) {
    return Math.max(MIN, Math.min(MAX, z));
  }

  function currentZoom() {
    var h = window.HmiView;
    return h && typeof h.getLiveDisplayZoom === 'function' ? h.getLiveDisplayZoom() : 1;
  }

  function updateLabel(z) {
    var fit = document.getElementById('hmi-zoom-fit');
    if (!fit) return;
    fit.textContent = z <= 1.001 ? 'Fit' : (Math.round(z * 10) / 10) + '\u00d7';
  }

  function applyZoom(z) {
    var h = window.HmiView;
    if (!h || typeof h.setLiveDisplayZoom !== 'function') return;
    var applied = h.setLiveDisplayZoom(clamp(z));
    updateLabel(applied);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest
      ? e.target.closest('#hmi-zoom-in, #hmi-zoom-out, #hmi-zoom-fit')
      : null;
    if (!t) return;
    e.preventDefault();
    var cur = currentZoom();
    if (t.id === 'hmi-zoom-in') applyZoom(cur * STEP);
    else if (t.id === 'hmi-zoom-out') applyZoom(cur / STEP);
    else applyZoom(1);
  });
})();
