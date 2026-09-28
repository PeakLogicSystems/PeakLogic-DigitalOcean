'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  frameStatus,
  frameSetDemandRpm,
  frameReadSensor,
  parseStatus,
  parseSensor,
  MOTOR_STATUS,
} = require('../src/drivers/vgreenEpcProtocol');

function crc16Modbus(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? ((crc >> 1) ^ 0xa001) : (crc >> 1);
  }
  return crc;
}

function withCrc(body) {
  const frame = Buffer.alloc(body.length + 2);
  body.copy(frame, 0);
  frame.writeUInt16LE(crc16Modbus(body), body.length);
  return frame;
}

describe('vgreenEpcProtocol', () => {
  it('builds status request frame', () => {
    const f = frameStatus(0x15);
    assert.equal(f.length, 5);
    assert.deepEqual([...f.subarray(0, 3)], [0x15, 0x43, 0x20]);
  });

  it('parses status response RUN', () => {
    const frame = withCrc(Buffer.from([0x15, 0x43, 0x10, MOTOR_STATUS.RUN]));
    const parsed = parseStatus(frame, 0x15);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value, MOTOR_STATUS.RUN);
  });

  it('set_demand encodes RPM x4 little-endian', () => {
    const f = frameSetDemandRpm(21, 1800);
    assert.equal(f[0], 21);
    assert.equal(f[1], 0x44);
    assert.equal(f[2], 0x20);
    assert.equal(f[3], 0);
    assert.equal(f.readUInt16LE(4), 7200);
  });

  it('read_sensor frame includes page and address', () => {
    const f = frameReadSensor(21, 0, 0);
    assert.deepEqual([...f.subarray(0, 5)], [21, 0x45, 0x20, 0, 0]);
  });

  it('parseSensor scales RPM by 4', () => {
    const frame = withCrc(Buffer.from([21, 0x45, 0x10, 0, 0, 0x20, 0x1c]));
    const parsed = parseSensor(frame, 21, 4);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value, 1800);
  });
});
