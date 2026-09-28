'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFromPreset } = require('../src/devices/devicePresets');
const { ModbusDriver } = require('../src/drivers/modbusDriver');

describe('S::CAN device templates', () => {
  it('builds spectro::lyser RTU preset with float parameter tags', () => {
    const { driver, tags } = buildFromPreset('scan_spectrolyser', { serialPort: 'COM5', slaveId: 4 });
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.baud, 38400);
    const partial = buildFromPreset('scan_spectrolyser', { serialPort: 'COM5', baud: undefined });
    assert.equal(partial.driver.baud, 38400);
    assert.equal(partial.driver.parity, 'odd');
    const wrongBaud = buildFromPreset('scan_spectrolyser', { serialPort: 'COM5', baud: 9600, parity: 'none' });
    assert.equal(wrongBaud.driver.baud, 38400);
    assert.equal(wrongBaud.driver.parity, 'odd');
    assert.equal(wrongBaud.driver.slaveId, 4);
    assert.equal(driver.parity, 'odd');
    assert.equal(driver.slaveId, 4);
    assert.ok(tags.some((t) => t.id === 'PARM1_VAL' && t.type === 'REAL'));
    const p1 = tags.find((t) => t.id === 'PARM1_VAL');
    assert.equal(p1.driverAddress.address, 122);
    assert.equal(p1.driverAddress.encoding, 'float32');
    assert.equal(p1.wordWidth, 32);
    assert.equal(tags.filter((t) => t.id.endsWith('_VAL')).length, 8);
  });

  it('builds spectro::lyser TCP preset', () => {
    const { driver } = buildFromPreset('scan_spectrolyser_tcp', { host: '10.0.0.5' });
    assert.equal(driver.type, 'modbus_tcp');
    assert.equal(driver.host, '10.0.0.5');
  });

  it('builds con::cube TCP preset with official register map', () => {
    const { driver, tags } = buildFromPreset('scan_concube_tcp', {
      host: '192.168.2.20',
      slaveId: 1,
      paramGroups: 1,
      paramStart: 1,
      paramCount: 4,
      includeSystemTags: true,
    });
    assert.equal(driver.type, 'modbus_tcp');
    assert.equal(driver.host, '192.168.2.20');
    assert.equal(driver.slaveId, 1);
    assert.ok(tags.some((t) => t.id === 'CUBE_DEV_STATUS'));
    const p1 = tags.find((t) => t.id === 'PARM1_VAL');
    assert.equal(p1.driverAddress.address, 130);
    assert.equal(p1.driverAddress.encoding, 'float32');
    assert.equal(tags.find((t) => t.id === 'PARM1_STS').driverAddress.address, 128);
    assert.equal(tags.filter((t) => t.id.endsWith('_VAL')).length, 4);
    assert.ok(tags.some((t) => t.id === 'PARM4_VAL'));
    assert.ok(!tags.some((t) => t.id === 'PARM5_VAL'));
  });

  it('builds con::cube RTU preset', () => {
    const { driver } = buildFromPreset('scan_concube_rtu', { serialPort: 'COM7' });
    assert.equal(driver.type, 'modbus_rtu');
    assert.equal(driver.serialPort, 'COM7');
    assert.equal(driver.baud, 38400);
    assert.equal(driver.parity, 'odd');
  });
});

describe('ModbusDriver float32 decode', () => {
  it('decodes big-endian IEEE float from two registers', () => {
    const drv = new ModbusDriver({ type: 'modbus_rtu', slaveId: 1 });
    const v = drv._decodeFloat32([0x4248, 0x0000], 'BE');
    assert.ok(Math.abs(v - 50) < 0.001);
  });
});
