'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { adaptProjectForHost } = require('../src/project/adaptProjectForHost');

describe('adaptProjectForHost', () => {
  it('remaps serial ports by ordinal role', () => {
    const doc = {
      drivers: [
        { id: 'a', serialPort: '/dev/ttyLP6' },
        { id: 'b', serialPort: '/dev/ttyLP4' },
      ],
    };
    const { doc: out, warnings } = adaptProjectForHost(doc, {
      PEAKLOGIC_RS485_PORT_A: 'COM3',
      PEAKLOGIC_RS485_PORT_B: 'COM5',
    });
    assert.equal(out.drivers[0].serialPort, 'COM3');
    assert.equal(out.drivers[1].serialPort, 'COM5');
    assert.equal(warnings.length, 2);
  });
});
