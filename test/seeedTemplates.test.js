'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');

describe('Seeed Studio device templates', () => {
  it('lists H2S template', () => {
    const p = listPresets().find((x) => x.id === 'seeed_h2s_101990863');
    assert.ok(p);
    assert.equal(p.transport, 'modbus_rtu');
    assert.equal(p.sharedBus, false);
  });

  it('builds Seeed 101990863 H2S map', () => {
    const { driver, tags } = buildFromPreset('seeed_h2s_101990863', { serialPort: 'COM8' });
    assert.equal(driver.id, 'seeed_h2s');
    assert.equal(driver.baud, 9600);
    assert.equal(driver.slaveId, 16);
    assert.equal(driver.serialPort, 'COM8');
    const h2s = tags.find((t) => t.id === 'H2S_PPM');
    assert.equal(h2s.driverAddress.table, 'holding');
    assert.equal(h2s.driverAddress.address, 8192);
    assert.equal(h2s.driverAddress.encoding, 'float32');
    assert.equal(tags.find((t) => t.id === 'H2S_TEMP_C').scale, 0.01);
    assert.equal(tags.find((t) => t.id === 'H2S_RH_PCT').driverAddress.address, 8198);
    assert.equal(tags.find((t) => t.id === 'H2S_MAX_PPM').driverAddress.address, 8200);
  });
});
