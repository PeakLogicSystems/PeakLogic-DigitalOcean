'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeDriverConfig, driverUsesSerialPort } = require('../src/drivers/driverConfig');

describe('driverConfig', () => {
  it('strips stray COM fields from nextcentury driver', () => {
    const out = sanitizeDriverConfig({
      id: 'nc1',
      type: 'nextcentury',
      enabled: true,
      serialPort: 'COM8',
      baud: 9600,
      slaveId: 1,
      email: 'a@b.com',
      reportId: 'rt_4510',
    });
    assert.equal(out.serialPort, undefined);
    assert.equal(out.baud, undefined);
    assert.equal(out.email, 'a@b.com');
  });

  it('keeps modbus_rtu serial fields', () => {
    const out = sanitizeDriverConfig({
      id: 'rtu1',
      type: 'modbus_rtu',
      serialPort: 'COM3',
      baud: 9600,
      slaveId: 2,
    });
    assert.equal(out.serialPort, 'COM3');
    assert.equal(out.slaveId, 2);
  });

  it('driverUsesSerialPort', () => {
    assert.equal(driverUsesSerialPort('modbus_rtu'), true);
    assert.equal(driverUsesSerialPort('nextcentury'), false);
  });

  it('mergeDriverSecrets keeps nextcentury password when client sends blank', () => {
    const { mergeDriverSecrets } = require('../src/drivers/driverConfig');
    const merged = mergeDriverSecrets(
      [{ id: 'nc1', type: 'nextcentury', email: 'a@b.com', password: '' }],
      [{ id: 'nc1', type: 'nextcentury', email: 'old@b.com', password: 'secret' }],
    );
    assert.equal(merged[0].email, 'a@b.com');
    assert.equal(merged[0].password, 'secret');
  });

  it('mergeDriverSecrets accepts new nextcentury password from client', () => {
    const { mergeDriverSecrets } = require('../src/drivers/driverConfig');
    const merged = mergeDriverSecrets(
      [{ id: 'nc1', type: 'nextcentury', email: 'a@b.com', password: 'new-secret' }],
      [{ id: 'nc1', type: 'nextcentury', email: 'old@b.com', password: 'old-secret' }],
    );
    assert.equal(merged[0].password, 'new-secret');
  });

  it('publicDriverList redacts nextcentury password and sets hasPassword', () => {
    const { publicDriverList } = require('../src/drivers/driverConfig');
    const out = publicDriverList([{ id: 'nc1', type: 'nextcentury', email: 'a@b.com', password: 'secret' }]);
    assert.equal(out[0].hasPassword, true);
    assert.equal(out[0].password, undefined);
  });
});
