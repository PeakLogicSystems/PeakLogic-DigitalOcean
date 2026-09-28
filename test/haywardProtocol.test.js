'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSimpleSpeedFrame,
  buildGoldlineFrame,
  parsePumpStatus,
  findSimpleFrame,
  pctToRpm,
  DEFAULT_MAX_RPM,
} = require('../src/drivers/haywardProtocol');

describe('haywardProtocol', () => {
  it('builds EcoStar 100% speed frame', () => {
    const frame = buildSimpleSpeedFrame(0, 100);
    assert.equal(frame.length, 10);
    assert.equal(frame[0], 0x10);
    assert.equal(frame[1], 0x02);
    assert.equal(frame[5], 100);
    assert.equal(frame[7], 0x83);
    const parsed = findSimpleFrame(frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.speed, 100);
  });

  it('builds off command at 0%', () => {
    const frame = buildSimpleSpeedFrame(0, 0);
    assert.equal(frame[5], 0);
    assert.equal(frame[7], 0x1f);
  });

  it('parses pump status frame', () => {
    const body = Buffer.from([0x00, 0x0c, 0x2d, 0x03, 0x28]);
    const frame = buildGoldlineFrame(body);
    const status = parsePumpStatus(frame);
    assert.equal(status.ok, true);
    assert.equal(status.speedPct, 0x2d);
    assert.equal(status.watts, 328);
    assert.equal(status.running, true);
  });

  it('converts speed pct to RPM', () => {
    assert.equal(pctToRpm(100, DEFAULT_MAX_RPM), 3450);
    assert.equal(pctToRpm(0, DEFAULT_MAX_RPM), 0);
  });
});
