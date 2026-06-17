'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { nextSlaveId, offsetTagsForDriver } = require('../src/devices/applyPresetUtils');

describe('applyPresetUtils', () => {
  it('nextSlaveId returns fallback when bus is empty', () => {
    const driver = { id: 'mbus', type: 'modbus_rtu', serialPort: 'COM3', slaveId: 1 };
    assert.equal(nextSlaveId([], [], driver, 1), 1);
  });

  it('nextSlaveId increments from tags and drivers on same port', () => {
    const drivers = [
      { id: 'mbus', type: 'modbus_rtu', serialPort: 'COM3', slaveId: 1 },
    ];
    const tags = [
      { id: 'DI1', driverId: 'mbus', driverAddress: { table: 'discrete', address: 0, slaveId: 1 } },
    ];
    assert.equal(nextSlaveId(drivers, tags, drivers[0], 1), 2);
  });

  it('offsetTagsForDriver keeps DI1 on first module', () => {
    const out = offsetTagsForDriver([
      { id: 'DI1', driverId: 'mbus', driverAddress: { table: 'discrete', address: 0 } },
      { id: 'DI16', driverId: 'mbus', driverAddress: { table: 'discrete', address: 15 } },
    ], 'mbus', [], 1);
    assert.equal(out[0].id, 'DI1');
    assert.equal(out[1].id, 'DI16');
    assert.equal(out[0].driverAddress.slaveId, 1);
  });

  it('offsetTagsForDriver continues DI numbering for second 16-point module', () => {
    const existing = Array.from({ length: 16 }, (_, i) => ({
      id: `DI${i + 1}`,
      driverId: 'mbus',
      driverAddress: { table: 'discrete', address: i, slaveId: 1 },
    }));
    const template = Array.from({ length: 16 }, (_, i) => ({
      id: `DI${i + 1}`,
      driverId: 'mbus',
      driverAddress: { table: 'discrete', address: i },
    }));
    const out = offsetTagsForDriver(template, 'mbus', existing, 2);
    assert.equal(out[0].id, 'DI17');
    assert.equal(out[15].id, 'DI32');
    assert.equal(out[0].driverAddress.slaveId, 2);
    assert.equal(out[0].driverAddress.address, 0);
  });

  it('offsetTagsForDriver offsets Q separately from DI', () => {
    const existing = [
      { id: 'DI1', driverId: 'mbus', driverAddress: { slaveId: 1 } },
      { id: 'DI8', driverId: 'mbus', driverAddress: { slaveId: 1 } },
      { id: 'Q1', driverId: 'mbus', driverAddress: { slaveId: 1 } },
      { id: 'Q8', driverId: 'mbus', driverAddress: { slaveId: 1 } },
    ];
    const out = offsetTagsForDriver([
      { id: 'DI1', driverId: 'mbus', driverAddress: { table: 'discrete', address: 0 } },
      { id: 'Q1', driverId: 'mbus', driverAddress: { table: 'coil', address: 0 } },
    ], 'mbus', existing, 2);
    assert.equal(out[0].id, 'DI9');
    assert.equal(out[1].id, 'Q9');
  });
});
