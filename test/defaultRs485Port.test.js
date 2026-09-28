'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { defaultModbusRtuSerialPort, IOT_LINK_PORT_A } = require('../src/appliance/defaultRs485Port');

describe('defaultRs485Port', () => {
  it('prefers PEAKLOGIC_RS485_PORT_A env', () => {
    assert.equal(
      defaultModbusRtuSerialPort({ PEAKLOGIC_RS485_PORT_A: '/dev/ttyCUSTOM' }),
      '/dev/ttyCUSTOM',
    );
  });

  it('documents IOT-LINK PORT A path', () => {
    assert.equal(IOT_LINK_PORT_A, '/dev/ttyLP6');
  });

  it('falls back to COM3 on non-linux', () => {
    const orig = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      assert.equal(defaultModbusRtuSerialPort({}), 'COM3');
    } finally {
      Object.defineProperty(process, 'platform', { value: orig });
    }
  });
});
