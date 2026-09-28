'use strict';

const LIVE_IO_UPDATE_KEY = 'mvLiveIoUpdate';

function readLiveIoUpdatePref(storage) {
  try {
    const v = storage.getItem(LIVE_IO_UPDATE_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

function writeLiveIoUpdatePref(storage, on) {
  try {
    storage.setItem(LIVE_IO_UPDATE_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
}

/** Live refresh while scan is active; when paused or stopped, honor the Enable I/O update preference. */
function shouldUpdateLiveIo({ runtimeRunning, runtimePaused, updatePrefEnabled }) {
  if (runtimeRunning && !runtimePaused) return true;
  if (runtimeRunning && runtimePaused) return false;
  return !!updatePrefEnabled;
}

module.exports = {
  LIVE_IO_UPDATE_KEY,
  readLiveIoUpdatePref,
  writeLiveIoUpdatePref,
  shouldUpdateLiveIo,
};
