'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFrame,
  checksum16,
  frameUltraTempCommand,
  framePumpStatus,
  framePumpSpeed,
  buildIcFrame,
  parseFrame,
  parseUltraTempStatus,
  parsePumpStatus,
  parseIcResponse,
  pointValue,
  CMD,
  MASTER_ADDR,
} = require('../src/drivers/pentairProtocol');

describe('pentairProtocol', () => {
  it('checksum matches pump status request (0x60)', () => {
    const frame = framePumpStatus(0x60);
    const body = frame.subarray(3, frame.length - 2);
    assert.equal(body[0], 0xA5);
    assert.equal(checksum16(body), frame.readUInt16BE(frame.length - 2));
    assert.equal(body[2], 0x60);
    assert.equal(body[3], MASTER_ADDR);
    assert.equal(body[4], CMD.STATUS);
    assert.equal(body[5], 0);
  });

  it('builds UltraTemp command frame', () => {
    const frame = frameUltraTempCommand(0x70, 1, 3);
    const parsed = parseFrame(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dest, 0x70);
    assert.equal(parsed.src, MASTER_ADDR);
    assert.equal(parsed.cmd, CMD.ULTRATEMP_CMD);
    assert.equal(parsed.data[0], 0x90);
    assert.equal(parsed.data[1], 1);
    assert.equal(parsed.data[3], 3);
  });

  it('parses UltraTemp status response', () => {
    const payload = Buffer.from([0xa0, 0x01, 0x01, 0x04, 0, 0, 0, 0, 0, 0]);
    const frame = buildFrame(MASTER_ADDR, 0x70, CMD.ULTRATEMP_STATUS, payload);
    const withPad = Buffer.concat([Buffer.from([0xff, 0xff]), frame]);
    const status = parseUltraTempStatus(withPad, 0x70);
    assert.equal(status.ok, true);
    assert.equal(status.mode, 1);
    assert.equal(status.running, true);
    assert.equal(status.cooling, false);
    assert.equal(status.offsetTemp, 4);
  });

  it('parses IntelliFlo pump status (2400 RPM capture)', () => {
    const payload = Buffer.from([0x0a, 0x09, 0x02, 0x03, 0x28, 0x09, 0x60, 0x39, 0x10, 0, 0, 0, 0, 0x15, 0x2c]);
    const frame = buildFrame(MASTER_ADDR, 0x60, CMD.STATUS, payload);
    const status = parsePumpStatus(frame, 0x60);
    assert.equal(status.ok, true);
    assert.equal(status.running, true);
    assert.equal(status.rpm, 2400);
    assert.equal(status.watts, 808);
    assert.equal(status.statusSpeck, 11);
  });

  it('builds pump speed command', () => {
    const frame = framePumpSpeed(0x60, 1800);
    const parsed = parseFrame(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.cmd, CMD.SPEED);
    assert.equal(parsed.data[3] * 256 + parsed.data[4], 1800);
  });

  it('parses IntelliChlor status response', () => {
    const frame = buildIcFrame([0x50, 0x12, 0x40, 0x00]);
    const parsed = parseIcResponse(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.saltPpm, 3200);
    assert.equal(parsed.icError, 0);
  });

  it('maps pump points via pointValue', () => {
    const pump = { ok: true, rpm: 2400, watts: 400, running: true, mode: 9, driveState: 2 };
    assert.equal(pointValue('rpm', { pump }), 2400);
    assert.equal(pointValue('running', { pump }), true);
  });

  it('builds IntelliValve goto commands for backwash positions', () => {
    const {
      frameIntelliValveGoto,
      intelliValveGotoCmd,
      INTELLIVALVE_CMD,
      INTELLIVALVE_RSP,
      parseIntelliValveDegrees,
      buildFrame,
    } = require('../src/drivers/pentairProtocol');
    assert.equal(intelliValveGotoCmd(0), INTELLIVALVE_CMD.GOTO_0);
    assert.equal(intelliValveGotoCmd(1), INTELLIVALVE_CMD.GOTO_24);
    assert.equal(intelliValveGotoCmd(2), INTELLIVALVE_CMD.GOTO_MIDDLE);
    const goto = frameIntelliValveGoto(0x0c, 1);
    const parsed = parseFrame(goto);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dest, 0x0c);
    assert.equal(parsed.cmd, INTELLIVALVE_CMD.GOTO_24);
    const rsp = buildFrame(MASTER_ADDR, 0x0c, INTELLIVALVE_RSP.DEGREES, Buffer.from([12, 1]));
    const degrees = parseIntelliValveDegrees(rsp, 0x0c);
    assert.equal(degrees.ok, true);
    assert.equal(degrees.position, 12);
    assert.equal(degrees.notMoving, true);
    assert.equal(degrees.atPos, true);
  });

  it('rejects checksum errors', () => {
    const frame = framePumpStatus(0x70);
    frame[frame.length - 1] ^= 0xff;
    const parsed = parseFrame(frame);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /checksum/i);
  });
});
