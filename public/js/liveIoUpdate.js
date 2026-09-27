'use strict';

/** Mirrors src/liveIoUpdate.js — keep in sync. */
window.PeakLogicLiveIoUpdate = (function () {
  const LIVE_IO_UPDATE_KEY = 'mvLiveIoUpdate';

  function readLiveIoUpdatePref() {
    try {
      const v = localStorage.getItem(LIVE_IO_UPDATE_KEY);
      if (v === null) return true;
      return v === '1';
    } catch {
      return true;
    }
  }

  function writeLiveIoUpdatePref(on) {
    try {
      localStorage.setItem(LIVE_IO_UPDATE_KEY, on ? '1' : '0');
    } catch { /* ignore */ }
  }

  function shouldUpdateLiveIo(runtime, updatePrefEnabled) {
    const running = !!runtime?.running;
    const paused = !!runtime?.paused;
    if (running && !paused) return true;
    if (running && paused) return false;
    return !!updatePrefEnabled;
  }

  return {
    LIVE_IO_UPDATE_KEY,
    readLiveIoUpdatePref,
    writeLiveIoUpdatePref,
    shouldUpdateLiveIo,
  };
})();
