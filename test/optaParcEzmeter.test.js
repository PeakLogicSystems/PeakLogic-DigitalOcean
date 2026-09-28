'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFromPreset, listPresets } = require('../src/devices/devicePresets');
const { thdPctFromPf, buildEzMeterThdTags } = require('../src/facilities/ezmeterThd');
const { buildEzMeterPqDerivedTags } = require('../src/facilities/ezmeterPq');

describe('ezmeterThd', () => {
  it('estimates THD from power factor', () => {
    assert.ok(thdPctFromPf(1) < 0.01);
    assert.ok(thdPctFromPf(0.9) > 40 && thdPctFromPf(0.9) < 50);
    assert.equal(thdPctFromPf(0), 0);
    assert.equal(thdPctFromPf(-0.85), thdPctFromPf(0.85));
  });

  it('builds THD memory tags', () => {
    const tags = buildEzMeterThdTags({ thdAlarmPct: 10 });
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_THD_ALM'));
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_CFG_THD_PCT' && t.value === 10));
  });
});

describe('arduino_opta_parc_ezmeter template', () => {
  it('is registered with DDS and PQ tags', () => {
    const listed = listPresets().find((p) => p.id === 'arduino_opta_parc_ezmeter');
    assert.ok(listed);
    assert.equal(listed.transport, 'mqtt_parc');
    const { tags } = buildFromPreset('arduino_opta_parc_ezmeter', { driverId: 'opta_st_01' });
    assert.ok(tags.some((t) => t.id === 'DDS_V_A' && t.driverAddress?.channel === 'DDS_V_A'));
    assert.ok(tags.some((t) => t.id === 'MECH_PQ_THD_IA'));
    assert.ok(tags.some((t) => t.id === 'I1'));
    const pqDerived = buildEzMeterPqDerivedTags();
    assert.ok(pqDerived.some((t) => t.id === 'MECH_PQ_CFG_THD_PCT'));
  });
});
