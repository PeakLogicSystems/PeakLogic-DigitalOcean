'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { optaModeLinkStatus } = require('../src/parc/optaModeLink');

describe('optaModeLinkStatus', () => {
  it('aligned when PC remote on + Opta standalone', () => {
    const s = optaModeLinkStatus({ remoteExecution: true, deviceMode: 'standalone' });
    assert.equal(s.aligned, true);
    assert.equal(s.modeLabel, 'Standalone (ST)');
  });

  it('aligned when PC remote off + Opta remote_io', () => {
    const s = optaModeLinkStatus({ remoteExecution: false, deviceMode: 'remote_io' });
    assert.equal(s.aligned, true);
    assert.equal(s.modeLabel, 'Remote I/O');
  });

  it('warns when PC remote on + Opta remote_io', () => {
    const s = optaModeLinkStatus({ remoteExecution: true, deviceMode: 'remote_io' });
    assert.equal(s.aligned, false);
    assert.match(s.hint, /Remote ST is ON/i);
  });

  it('warns when PC remote off + Opta standalone', () => {
    const s = optaModeLinkStatus({ remoteExecution: false, deviceMode: 'standalone' });
    assert.equal(s.aligned, false);
    assert.match(s.hint, /Remote ST is OFF/i);
  });
});
