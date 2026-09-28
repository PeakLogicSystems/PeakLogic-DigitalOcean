'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  POOL_RELAY_ROLES,
  parseWaveshareRelayBindings,
  buildWaveshareRelayDriver,
  bindWavesharePoolRelays,
} = require('../src/devices/wavesharePoolRelay');

describe('wavesharePoolRelay', () => {
  it('parses a single-board env trio', () => {
    const bindings = parseWaveshareRelayBindings({
      PEAKLOGIC_POOL_WAVESHARE_RELAY: 'true',
      PEAKLOGIC_POOL_WAVESHARE_ROLE: 'heater',
      PEAKLOGIC_POOL_WAVESHARE_DEVICE_ID: 'ws_relay_heat',
      PEAKLOGIC_POOL_WAVESHARE_DI: 'flow_sw',
    });
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].role, 'heater');
    assert.equal(bindings[0].deviceId, 'ws_relay_heat');
    assert.equal(bindings[0].diRole, 'flow_sw');
  });

  it('parses a multi-board RELAYS list', () => {
    const bindings = parseWaveshareRelayBindings({
      PEAKLOGIC_POOL_WAVESHARE_RELAYS: 'dose_acid:ws_relay_acid:flow_sw,light_z1:ws_relay_lz1',
    });
    assert.equal(bindings.length, 2);
    assert.equal(bindings[0].diRole, 'flow_sw');
    assert.equal(bindings[1].role, 'light_z1');
    assert.equal(bindings[1].diRole, null);
  });

  it('rejects unknown roles', () => {
    assert.throws(
      () => parseWaveshareRelayBindings({ PEAKLOGIC_POOL_WAVESHARE_RELAYS: 'fountain:ws_x' }),
      /Unknown Waveshare pool relay role/,
    );
  });

  it('accepts spa_jets as a residential spa load', () => {
    const bindings = parseWaveshareRelayBindings({
      PEAKLOGIC_POOL_WAVESHARE_RELAYS: 'spa_jets:ws_relay_spa',
    });
    assert.equal(bindings[0].role, 'spa_jets');
  });

  it('builds a remote_io mqtt_parc driver', () => {
    const d = buildWaveshareRelayDriver({
      role: 'dose_cl',
      deviceId: 'ws_relay_cl',
      driverId: 'ws_relay_cl',
      diRole: null,
    });
    assert.equal(d.type, 'mqtt_parc');
    assert.equal(d.remoteExecution, false);
    assert.equal(d.platform, 'waveshare-esp32s3-relay-1ch');
  });

  it('retargets pool tags onto the satellite driver', () => {
    const byId = new Map([
      ['DOSE_ACID', { id: 'DOSE_ACID', type: 'BOOL', role: 'output', value: false }],
    ]);
    bindWavesharePoolRelays(byId, [{
      role: 'dose_acid',
      deviceId: 'ws_relay_acid',
      driverId: 'ws_relay_acid',
      diRole: 'flow_sw',
    }]);
    assert.equal(byId.get('DOSE_ACID').driverId, 'ws_relay_acid');
    assert.equal(byId.get('DOSE_ACID').driverAddress.channel, 'R1');
    assert.equal(byId.get('POOL_FLOW_SW').driverAddress.channel, 'I1');
    assert.ok(POOL_RELAY_ROLES.pump_pilot);
  });
});
