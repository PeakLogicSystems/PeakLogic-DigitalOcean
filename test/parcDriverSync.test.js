'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isParcPlaceholderDeviceId,
  bindTemplateDriverToRegistry,
  listUnlinkedFieldRegistryDevices,
} = require('../src/parc/parcDriverSync');

describe('parcDriverSync', () => {
  it('isParcPlaceholderDeviceId detects template placeholders', () => {
    assert.equal(isParcPlaceholderDeviceId('lift_dd_01', 'lift_station_dual_duplex'), true);
    assert.equal(isParcPlaceholderDeviceId('mv_f2e689fd60d96bab', 'ck_2707575'), false);
  });

  it('listUnlinkedFieldRegistryDevices prefers mv_ over legacy opta_ for same serial', () => {
    const registry = {
      listDevices: () => [
        { deviceId: 'opta_0123b636f1c23964ee', meta: { ateccSerial: '0123b636f1c23964ee' } },
        { deviceId: 'mv_f2e689fd60d96bab', meta: { ateccSerial: '0123b636f1c23964ee' } },
      ],
    };
    const unlinked = listUnlinkedFieldRegistryDevices(registry, []);
    assert.equal(unlinked.length, 1);
    assert.equal(unlinked[0].deviceId, 'mv_f2e689fd60d96bab');
  });

  it('bindTemplateDriverToRegistry binds sole unlinked registry device', () => {
    const registry = {
      listDevices: () => [
        { deviceId: 'mv_f2e689fd60d96bab', meta: { ateccSerial: '0123b636f1c23964ee' } },
      ],
    };
    const driver = {
      id: 'lift_station_dual_duplex',
      type: 'mqtt_parc',
      deviceId: 'lift_dd_01',
    };
    const bound = bindTemplateDriverToRegistry(driver, registry, []);
    assert.equal(bound.deviceId, 'mv_f2e689fd60d96bab');
    assert.equal(bound.ateccSerial, '0123b636f1c23964ee');
  });
});
