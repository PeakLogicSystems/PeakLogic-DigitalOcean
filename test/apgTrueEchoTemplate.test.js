'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { ModbusDriver } = require('../src/drivers/modbusDriver');

describe('APG True Echo device template', () => {
  it('lists True Echo RTU template', () => {
    const p = listPresets().find((x) => x.id === 'apg_true_echo_rtu');
    assert.ok(p);
    assert.equal(p.transport, 'modbus_rtu');
    assert.equal(p.sharedBus, false);
  });

  it('builds APG True Echo map with CDAB floats and 100 ms frame delay', () => {
    const { driver, tags } = buildFromPreset('apg_true_echo_rtu', { serialPort: 'COM9' });
    assert.equal(driver.id, 'apg_true_echo');
    assert.equal(driver.baud, 9600);
    assert.equal(driver.slaveId, 1);
    assert.equal(driver.serialPort, 'COM9');
    assert.equal(driver.frameDelayMs, 100);
    assert.equal(driver.pollIntervalMs, 500);
    assert.equal(driver.timeoutMs, 2000);

    assert.equal(tags.find((t) => t.id === 'TE_DIST_CM').driverAddress.address, 0);
    assert.equal(tags.find((t) => t.id === 'TE_DIST_MM').driverAddress.address, 1);
    assert.equal(tags.find((t) => t.id === 'TE_LVL_CM').driverAddress.address, 2);
    assert.equal(tags.find((t) => t.id === 'TE_LVL_MM').driverAddress.address, 3);

    const level = tags.find((t) => t.id === 'TE_LEVEL');
    assert.equal(level.driverAddress.table, 'input');
    assert.equal(level.driverAddress.address, 38);
    assert.equal(level.driverAddress.encoding, 'float32');
    assert.equal(level.driverAddress.byteOrder, 'CDAB');

    const dist = tags.find((t) => t.id === 'TE_DIST');
    assert.equal(dist.driverAddress.address, 40);
    assert.equal(dist.driverAddress.byteOrder, 'CDAB');

    const space = tags.find((t) => t.id === 'TE_SPACE');
    assert.equal(space.driverAddress.address, 36);
  });
});

describe('ModbusDriver float32 CDAB (APG True Echo)', () => {
  it('decodes CDAB word-swapped float (50.0)', () => {
    const drv = new ModbusDriver({ type: 'modbus_rtu', slaveId: 1 });
    // 50.0f = 0x42480000 → ABCD regs [0x4248, 0x0000]; CDAB regs [0x0000, 0x4248]
    const v = drv._decodeFloat32([0x0000, 0x4248], 'CDAB');
    assert.ok(Math.abs(v - 50) < 0.001);
  });

  it('still decodes BE/ABCD', () => {
    const drv = new ModbusDriver({ type: 'modbus_rtu', slaveId: 1 });
    const v = drv._decodeFloat32([0x4248, 0x0000], 'BE');
    assert.ok(Math.abs(v - 50) < 0.001);
  });
});
