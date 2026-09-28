'use strict';

/** Shared I/O point timestamp formatting for live panels and tag tables. */
window.PeaklogicIoTimestamp = (function () {
  function formatAbsolute(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    if (window.PeaklogicTime?.formatClockMs) return window.PeaklogicTime.formatClockMs(ms);
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const mmm = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
  }

  function formatRelative(ms, now = Date.now()) {
    if (ms == null || !Number.isFinite(ms)) return 'never updated';
    const delta = Math.max(0, now - ms);
    if (delta < 1000) return 'just now';
    const sec = Math.floor(delta / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  function ioTsClass(stopped) {
    return stopped ? 'io-ts muted io-ts-stopped' : 'io-ts muted';
  }

  function ioTsSpan(ms, { stopped = false } = {}) {
    const text = formatAbsolute(ms);
    const title = formatRelative(ms);
    const cls = ioTsClass(stopped);
    const attr = ms != null && Number.isFinite(ms) ? ` data-io-ts="${ms}"` : '';
    return `<span class="${cls}"${attr} title="${title}">${text}</span>`;
  }

  function updateIoTsEl(el, ms, { stopped = false } = {}) {
    if (!el) return;
    el.className = ioTsClass(stopped);
    el.textContent = formatAbsolute(ms);
    el.title = formatRelative(ms);
    if (ms != null && Number.isFinite(ms)) el.dataset.ioTs = String(ms);
    else delete el.dataset.ioTs;
  }

  return {
    formatAbsolute,
    formatRelative,
    ioTsSpan,
    updateIoTsEl,
  };
})();
