'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePositionId,
  suggestPositionId,
  isSnBasedPositionId,
} = require('../src/parc/positionId');
const {
  buildParcOptaDriver,
  replaceParcOptaHardware,
  renameParcOptaPosition,
  bulkAddParcOptaDrivers,
} = require('../src/devices/bulkAddParcOpta');

describe('positionId', () => {
  it('normalizePositionId accepts plant-style names', () => {
    assert.equal(normalizePositionId('motor_skid_main'), 'motor_skid_main');
    assert.equal(normalizePositionId('mcc1.line3'), 'mcc1.line3');
  });

  it('isSnBasedPositionId detects ATECC ids', () => {
    assert.equal(isSnBasedPositionId('opta_0123b636f1c23964ee'), true);
    assert.equal(isSnBasedPositionId('motor_skid_main'), false);
  });

  it('suggestPositionId uses registry name or serial suffix', () => {
    assert.equal(
      suggestPositionId({ name: 'Pump Skid A', ateccSerial: '0123b636f1c23964ee' }, 'opta_0123b636f1c23964ee'),
      'pump_skid_a',
    );
    assert.equal(
      suggestPositionId({ ateccSerial: '0123b636f1c23964ee' }, 'opta_0123b636f1c23964ee'),
      'io_3964ee',
    );
  });
});

describe('parc position drivers', () => {
  it('buildParcOptaDriver separates position id from device id', () => {
    const d = buildParcOptaDriver('opta_0123b636f1c23964ee', {
      positionId: 'motor_skid_main',
      name: 'Motor skid',
    }, { ateccSerial: '0123b636f1c23964ee' });
    assert.equal(d.id, 'motor_skid_main');
    assert.equal(d.deviceId, 'opta_0123b636f1c23964ee');
    assert.equal(d.name, 'Motor skid');
  });

  it('bulkAddParcOptaDrivers assigns position ids for registry devices', () => {
    const registry = {
      listDevices: () => [{ deviceId: 'opta_0123b636f1c23964ee', ateccSerial: '0123b636f1c23964ee' }],
      getDevice: (id) => (id === 'opta_0123b636f1c23964ee'
        ? { deviceId: id, ateccSerial: '0123b636f1c23964ee' }
        : null),
    };
    const r = bulkAddParcOptaDrivers({
      driverList: [],
      body: { fromRegistry: true },
      registry,
    });
    assert.equal(r.added.length, 1);
    assert.equal(r.drivers[0].deviceId, 'opta_0123b636f1c23964ee');
    assert.notEqual(r.drivers[0].id, r.drivers[0].deviceId);
  });

  it('bulkAddParcOptaDrivers honors positionId for single registry device', () => {
    const registry = {
      listDevices: () => [{ deviceId: 'mv_f2e689fd60d96bab', ateccSerial: '0123b636f1c23964ee' }],
      getDevice: (id) => (id === 'mv_f2e689fd60d96bab'
        ? { deviceId: id, ateccSerial: '0123b636f1c23964ee' }
        : null),
    };
    const r = bulkAddParcOptaDrivers({
      driverList: [],
      body: { fromRegistry: true, positionId: 'ck_2707575' },
      registry,
    });
    assert.equal(r.added.length, 1);
    assert.equal(r.drivers[0].id, 'ck_2707575');
    assert.equal(r.drivers[0].deviceId, 'mv_f2e689fd60d96bab');
  });

  it('replaceParcOptaHardware keeps position id and records history', () => {
    const registry = {
      getDevice: (id) => (id === 'opta_newserial00000001'
        ? { deviceId: id, ateccSerial: 'newserial00000001' }
        : null),
    };
    const driverList = [{
      id: 'motor_skid_main',
      type: 'mqtt_parc',
      enabled: true,
      deviceId: 'opta_0123b636f1c23964ee',
      ateccSerial: '0123b636f1c23964ee',
    }];
    const r = replaceParcOptaHardware({
      driverList,
      positionId: 'motor_skid_main',
      newDeviceId: 'opta_newserial00000001',
      registry,
      note: 'RMA swap',
    });
    assert.equal(r.drivers[0].id, 'motor_skid_main');
    assert.equal(r.drivers[0].deviceId, 'opta_newserial00000001');
    assert.equal(r.drivers[0].hardwareHistory.length, 1);
    assert.equal(r.drivers[0].hardwareHistory[0].deviceId, 'opta_0123b636f1c23964ee');
  });

  it('renameParcOptaPosition updates tag driverId', () => {
    const r = renameParcOptaPosition({
      driverList: [{ id: 'opta_0123b636f1c23964ee', type: 'mqtt_parc', deviceId: 'opta_0123b636f1c23964ee' }],
      tagList: [{ id: 'R1', driverId: 'opta_0123b636f1c23964ee' }],
      oldPositionId: 'opta_0123b636f1c23964ee',
      newPositionId: 'motor_skid_main',
    });
    assert.equal(r.drivers[0].id, 'motor_skid_main');
    assert.equal(r.tags[0].driverId, 'motor_skid_main');
  });
});
