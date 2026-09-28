'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ntcDividerTempC,
  optaNtcDividerTempC,
  normalizeLinearizeFields,
  ntcDisplayScaleOffset,
  inferNtcEngUnit,
  ntcTrimFromTag,
} = require('../src/tags/tagLinearize');
const { twoPointToScaleOffset, rawFromStoredValue } = require('../src/tags/tagCalibrate');
const { rawToEngineering } = require('../src/tags/tagAnalog');

describe('tagLinearize', () => {
  it('converts simple 10K NTC divider ADC to °C near 25°C', () => {
    const tag = { linearize: 'ntc_divider', adcMax: 1023, vRef: 10, rFixed: 10000 };
    const t = ntcDividerTempC(512, tag);
    assert.ok(t > 20 && t < 30, `expected ~25°C, got ${t}`);
  });

  it('converts Opta 24 VDC divider ADC to °C near 25°C', () => {
    const tag = {
      linearize: 'opta_ntc_divider',
      adcMax: 1023,
      adcMaxVoltage: 10,
      vSupply: 24,
      rFixed: 10000,
      rOptaInternal: 5850,
    };
    // ~6.57 V at 25°C → ~670 counts (Opta ST/MQTT 10-bit raw)
    const t = optaNtcDividerTempC(670, tag);
    assert.ok(t > 20 && t < 30, `expected ~25°C, got ${t}`);
  });

  it('approximates inverse raw from forward temperature', () => {
    const tag = { linearize: 'opta_ntc_divider', vSupply: 24 };
    const knownRaw = 670;
    const temp = optaNtcDividerTempC(knownRaw, tag);
    assert.ok(temp != null);
    const back = rawFromStoredValue({ ...tag, linearize: 'opta_ntc_divider' }, temp);
    assert.ok(back != null);
    assert.ok(Math.abs(back - knownRaw) < 20);
  });

  it('normalizes linearize fields', () => {
    assert.deepEqual(normalizeLinearizeFields({ linearize: 'opta_ntc_divider', vSupply: 24 }), {
      linearize: 'opta_ntc_divider',
      adcMax: 1023,
      adcMaxVoltage: 10,
      vSupply: 24,
      rFixed: 10000,
      rOptaInternal: 5850,
      ntcR25: 10000,
      ntcBeta: 3950,
    });
    assert.deepEqual(normalizeLinearizeFields({}), {});
  });

  it('maps NTC display unit to scale and offset', () => {
    assert.deepEqual(ntcDisplayScaleOffset('C', 0), { scale: 1, offset: 0 });
    assert.deepEqual(ntcDisplayScaleOffset('F', 0), { scale: 1.8, offset: 32 });
    assert.deepEqual(ntcDisplayScaleOffset('F', -2), { scale: 1.8, offset: 30 });
  });

  it('infers eng unit and trim from tag scale/offset', () => {
    const fTag = { engUnit: 'F', scale: 1.8, offset: 30 };
    assert.equal(inferNtcEngUnit(fTag), 'F');
    assert.equal(ntcTrimFromTag(fTag), -2);
  });
});

describe('tagCalibrate', () => {
  it('computes scale and offset from two points', () => {
    const r = twoPointToScaleOffset(0, 32, 100, 212);
    assert.ok(r);
    assert.ok(Math.abs(r.scale - 1.8) < 0.001);
    assert.ok(Math.abs(r.offset - 32) < 0.001);
  });

  it('inverts linear scale for capture', () => {
    const tag = { scale: 0.4887, offset: 0, linearize: 'none' };
    assert.equal(rawFromStoredValue(tag, 48.87), 100);
  });

  it('inverts Opta NTC °F display back to raw ADC', () => {
    const tag = {
      linearize: 'opta_ntc_divider',
      engUnit: 'F',
      adcMax: 1023,
      vSupply: 24,
      scale: 1.8,
      offset: 32,
    };
    const raw = rawFromStoredValue(tag, 75);
    assert.ok(raw != null);
    assert.ok(Math.abs(raw - 670) < 25, `expected ~670 raw, got ${raw}`);
  });
});

describe('rawToEngineering with linearize', () => {
  it('chains Opta NTC then scale', () => {
    const tag = { linearize: 'opta_ntc_divider', vSupply: 24, scale: 1, offset: 0 };
    const eng = rawToEngineering(670, tag);
    assert.ok(eng > 20 && eng < 30);
  });
});
