'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFrame,
  checksum8,
  frameEpumpRpm,
  parseEpumpStatus,
  parseAquapureResponse,
  findFrame,
  CMD,
  MASTER_ADDR,
  DEFAULT_EPUMP_ADDR,
} = require('../src/drivers/jandyProtocol');

describe('jandyProtocol', () => {
  it('checksum matches ePump RPM command', () => {
    const frame = frameEpumpRpm(DEFAULT_EPUMP_ADDR, 2520);
    const parsed = findFrame(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dest, DEFAULT_EPUMP_ADDR);
    assert.equal(parsed.cmd, CMD.EPUMP_RPM);
    assert.equal(parsed.data[0], 0x00);
    assert.equal(parsed.data[1], 0x27);
    assert.equal(parsed.data[2], 0x60);
  });

  it('parses ePump status response for RPM', () => {
    const statusData = Buffer.from([CMD.EPUMP_RPM, 0x00, 0x60, 0x27, 0x00]);
    const frame = buildFrame(MASTER_ADDR, CMD.EPUMP_STATUS, statusData);
    const status = parseEpumpStatus(frame, CMD.EPUMP_RPM);
    assert.equal(status.ok, true);
    assert.equal(status.rpm, 2520);
    assert.equal(status.running, true);
  });

  it('parses AquaPure PPM response', () => {
    const frame = buildFrame(MASTER_ADDR, CMD.PPM, Buffer.from([0x0c, 0x00]));
    const parsed = parseAquapureResponse(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.saltPpm, 1200);
    assert.equal(parsed.lowSalt, false);
  });
});
