'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LIVE_IO_UPDATE_KEY,
  readLiveIoUpdatePref,
  writeLiveIoUpdatePref,
  shouldUpdateLiveIo,
} = require('../src/liveIoUpdate');

describe('liveIoUpdate', () => {
  function mockStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, v); },
    };
  }

  it('defaults Enable I/O update to on when preference unset', () => {
    const storage = mockStorage();
    assert.equal(readLiveIoUpdatePref(storage), true);
    writeLiveIoUpdatePref(storage, false);
    assert.equal(storage.getItem(LIVE_IO_UPDATE_KEY), '0');
    assert.equal(readLiveIoUpdatePref(storage), false);
    writeLiveIoUpdatePref(storage, true);
    assert.equal(readLiveIoUpdatePref(storage), true);
  });

  it('always refreshes while runtime scan is active', () => {
    assert.equal(
      shouldUpdateLiveIo({ runtimeRunning: true, runtimePaused: false, updatePrefEnabled: false }),
      true,
    );
    assert.equal(
      shouldUpdateLiveIo({ runtimeRunning: true, runtimePaused: true, updatePrefEnabled: true }),
      false,
    );
  });

  it('honors preference when runtime is stopped', () => {
    assert.equal(
      shouldUpdateLiveIo({ runtimeRunning: false, runtimePaused: false, updatePrefEnabled: true }),
      true,
    );
    assert.equal(
      shouldUpdateLiveIo({ runtimeRunning: false, runtimePaused: false, updatePrefEnabled: false }),
      false,
    );
  });
});
