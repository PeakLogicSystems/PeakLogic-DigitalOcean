'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  VALVE_CHANNELS,
  buildResPoolValveDriver,
  bindResPoolValves,
} = require('../src/devices/resPoolValves');

describe('resPoolValves', () => {
  it('configures four backwash valve channels', () => {
    assert.equal(VALVE_CHANNELS.length, 4);
    assert.equal(VALVE_CHANNELS[0].tagId, 'FILT_INLET');
    assert.equal(VALVE_CHANNELS[1].tagId, 'FILT_OUTLET');
    assert.equal(VALVE_CHANNELS[2].tagId, 'BW_WASTE');
    assert.equal(VALVE_CHANNELS[3].tagId, 'BW_SPARE');
  });

  it('builds a remote_io mqtt_parc driver', () => {
    const d = buildResPoolValveDriver({});
    assert.equal(d.id, 'res_pool_valves');
    assert.equal(d.type, 'mqtt_parc');
    assert.equal(d.remoteExecution, false);
    assert.equal(d.platform, 'esp32-res-pool-link');
  });

  it('binds ST mode coils and the four valve tags', () => {
    const byId = new Map([
      ['BW_VALVE_FILTER', { id: 'BW_VALVE_FILTER', type: 'BOOL', role: 'output', value: true }],
      ['BW_VALVE_BW', { id: 'BW_VALVE_BW', type: 'BOOL', role: 'output', value: false }],
    ]);
    bindResPoolValves(byId, 'res_pool_valves');
    assert.equal(byId.get('FILT_INLET').driverAddress.channel, 'R1');
    assert.equal(byId.get('FILT_OUTLET').driverAddress.channel, 'R2');
    assert.equal(byId.get('BW_WASTE').driverAddress.channel, 'R3');
    assert.equal(byId.get('BW_SPARE').driverAddress.channel, 'R4');
    assert.equal(byId.get('BW_VALVE_FILTER').driverId, 'res_pool_valves');
    assert.equal(byId.get('BW_VALVE_BW').driverAddress.channel, 'BW_VALVE_BW');
  });
});
