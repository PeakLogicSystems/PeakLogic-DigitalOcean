'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  modbusCrc16,
  bcDeployCrcFromBuffer,
  bcDeployCrcFromBase64,
} = require('../src/engine/bcDeployCrc');

describe('bcDeployCrc', () => {
  it('modbus CRC matches classic test vector', () => {
    assert.equal(modbusCrc16(Buffer.from('123456789')), 0x4b37);
  });

  it('bcDeployCrcFromBase64 matches buffer CRC', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
    const b64 = buf.toString('base64');
    assert.equal(bcDeployCrcFromBase64(b64), bcDeployCrcFromBuffer(buf));
  });

  it('returns zero for missing or invalid base64', () => {
    assert.equal(bcDeployCrcFromBase64(''), 0);
    assert.equal(bcDeployCrcFromBase64(null), 0);
  });
});
