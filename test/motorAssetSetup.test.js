'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  computeAgeFactor,
  effectiveInstallDate,
  normalizeAssetContext,
  defaultScadaTags,
  clampDays,
  SERVICE_EVENT_TYPES,
} = require('../src/pdm/motorAssetSetup');

describe('motorAssetSetup', () => {
  it('computes age factor with 3-year baseline', () => {
    assert.equal(computeAgeFactor(2), 1);
    assert.equal(computeAgeFactor(8), 1.2);
  });

  it('uses pump replacement for effective install date', () => {
    const eff = effectiveInstallDate([
      { date: '2015-01-01', type: 'install' },
      { date: '2022-06-01', type: 'pump_replacement' },
    ], '2015-01-01');
    assert.equal(eff, '2022-06-01');
  });

  it('includes expanded service event types', () => {
    assert.ok(SERVICE_EVENT_TYPES.includes('control_panel'));
    assert.ok(SERVICE_EVENT_TYPES.includes('float_replacement'));
    assert.ok(SERVICE_EVENT_TYPES.includes('filter_service'));
  });

  it('normalizes pump lift station context', () => {
    const ctx = normalizeAssetContext({
      motorType: 'pump',
      application: 'lift_station',
      configuration: 'duplex',
      locationClass: 'strip_mall',
      installDate: '2017-06-01',
      pumpIndex: 2,
      pumpRole: 'lag',
    }, 'pump-2');
    assert.equal(ctx.motorType, 'pump');
    assert.equal(ctx.configuration, 'duplex');
    assert.equal(ctx.pumpRole, 'lag');
    assert.ok(ctx.ageFactor >= 1);
  });

  it('suggests fan and compressor tags', () => {
    assert.deepEqual(defaultScadaTags({ motorType: 'fan', unitIndex: 1 }), [
      'FAN1_HRS', 'FAN1_STARTS', 'FAN1_AMPS', 'FAN1_RUN_FB',
    ]);
    assert.ok(defaultScadaTags({ motorType: 'compressor', unitIndex: 2 }).includes('COMP2_START_MS'));
  });

  it('maps duplex pump CT tags and start ms', () => {
    const lead = defaultScadaTags({ motorType: 'pump', configuration: 'duplex', pumpIndex: 1 });
    assert.ok(lead.includes('MOTOR1_START_MS'));
    assert.ok(lead.includes('AI1'));
    assert.ok(lead.includes('I1_RAW'));
    const lag = defaultScadaTags({ motorType: 'pump', configuration: 'duplex', pumpIndex: 2 });
    assert.ok(lag.includes('MOTOR2_START_MS'));
    assert.ok(lag.includes('AI4'));
    assert.ok(lag.includes('I4_RAW'));
  });

  it('clamps seed days 30–360', () => {
    assert.equal(clampDays(10), 30);
    assert.equal(clampDays(180), 180);
    assert.equal(clampDays(500), 360);
  });
});
