'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { fixtureFilesForProgram } = require('../src/programs/programFixtures');

describe('TENET UL212NT-E device template', () => {
  it('lists UL212NT-E template', () => {
    const p = listPresets().find((x) => x.id === 'tenet_ul212nt_e');
    assert.ok(p);
    assert.equal(p.transport, 'modbus_rtu');
    assert.equal(p.sharedBus, false);
    assert.equal(p.defaultProgram, 'modbus/09_ul212nt_e_level.st');
  });

  it('builds Protocol 17 holding map', () => {
    const { driver, tags } = buildFromPreset('tenet_ul212nt_e', { serialPort: 'COM8' });
    assert.equal(driver.id, 'ul212nt');
    assert.equal(driver.baud, 9600);
    assert.equal(driver.slaveId, 1);
    assert.equal(driver.serialPort, 'COM8');
    const level = tags.find((t) => t.id === 'FUEL_LEVEL_MM');
    assert.equal(level.driverAddress.table, 'holding');
    assert.equal(level.driverAddress.address, 256);
    assert.equal(level.scale, 0.1);
    assert.equal(level.signed, false);
    assert.equal(tags.find((t) => t.id === 'FUEL_TILT').driverAddress.address, 258);
  });

  it('maps ST sample to UL212 fixtures', () => {
    const spec = fixtureFilesForProgram('modbus/09_ul212nt_e_level.st');
    assert.equal(spec.tagsFile, 'tags.ul212nt_e.json');
    assert.equal(spec.driversFile, 'drivers.ul212nt_e.json');
  });
});
