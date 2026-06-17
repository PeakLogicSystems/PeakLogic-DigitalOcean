'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { OptaRemoteDriver, baseUrl, tagChannel } = require('../src/drivers/optaRemoteDriver');

describe('optaRemoteDriver helpers', () => {
  it('baseUrl builds http host', () => {
    assert.equal(baseUrl({ host: '192.168.1.50', port: 80 }), 'http://192.168.1.50');
    assert.equal(baseUrl({ host: '10.0.0.2', port: 8080 }), 'http://10.0.0.2:8080');
  });

  it('tagChannel prefers driverAddress.channel', () => {
    assert.equal(tagChannel({ id: 'I1', driverAddress: { channel: 'I1' } }), 'I1');
    assert.equal(tagChannel({ id: 'R2', driverAddress: {} }), 'R2');
  });

  it('_tagMetaForDevice includes PID gains and preset', () => {
    const d = new OptaRemoteDriver({ id: 'opta_eth' });
    const meta = d._tagMetaForDevice({
      id: 'PID1',
      type: 'PID',
      role: 'memory',
      preset: 512,
      mode: 'PI',
      kp: 0.5,
      ki: 0.1,
      kd: 0,
      outMin: 0,
      outMax: 1023,
      value: 0,
    });
    assert.equal(meta.id, 'PID1');
    assert.equal(meta.preset, 512);
    assert.equal(meta.kp, 0.5);
    assert.equal(meta.mode, 'PI');
  });
});
