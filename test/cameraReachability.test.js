'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRtspTarget,
  checkRtspReachability,
  clearReachabilityCache,
  unreachableError,
} = require('../src/cameras/cameraReachability');

describe('cameraReachability', () => {
  it('parseRtspTarget reads host and port from RTSP URL', () => {
    assert.deepEqual(
      parseRtspTarget('rtsp://admin:pass@192.168.1.65:554/h264Preview_01_sub'),
      { host: '192.168.1.65', port: 554 },
    );
  });

  it('parseRtspTarget falls back to camera host and settings.rtspPort', () => {
    assert.deepEqual(
      parseRtspTarget('', { host: '10.0.0.5' }, { rtspPort: 8554 }),
      { host: '10.0.0.5', port: 8554 },
    );
  });

  it('checkRtspReachability returns false for unreachable host', async () => {
    clearReachabilityCache();
    const reach = await checkRtspReachability(
      'rtsp://admin:pass@192.0.2.1:554/stream',
      {},
      { rtspReachabilityTimeoutMs: 200, rtspReachabilityCacheMs: 1000 },
    );
    assert.equal(reach.ok, false);
    assert.match(reach.error, /192\.0\.2\.1:554 unreachable/);
  });

  it('checkRtspReachability can be disabled via settings', async () => {
    clearReachabilityCache();
    const reach = await checkRtspReachability(
      'rtsp://admin:pass@192.0.2.1:554/stream',
      {},
      { rtspReachabilityCheckEnabled: false },
    );
    assert.equal(reach.ok, true);
  });

  it('unreachableError marks skipped host-unreachable failures', () => {
    const err = unreachableError({
      ok: false,
      host: '192.168.1.65',
      port: 554,
      error: 'RTSP 192.168.1.65:554 unreachable',
    });
    assert.equal(err.code, 'EHOSTUNREACH');
    assert.equal(err.status, 503);
    assert.equal(err.skipped, true);
  });
});
