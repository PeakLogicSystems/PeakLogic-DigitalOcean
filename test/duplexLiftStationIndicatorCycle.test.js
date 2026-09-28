'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  DUPLEXLS_STATION_STATUS_STATES,
  DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT,
  DUPLEXLS_INDICATOR_CYCLE_STEP_MS,
  DUPLEXLS_INDICATOR_CYCLE_MS,
  DUPLEXLS_STARTS_TAGS,
  DUPLEXLS_ETM_TAGS,
  buildDuplexlsIndicatorCycleStep,
  duplexlsIndicatorCycleLiveMap,
  listDuplexlsIndicatorCycleSteps,
  runDuplexlsIndicatorCycle,
} = require('../src/hmi/duplexlsIndicatorCycle');
const { repairCompositeBindings } = require('../src/hmi/hmiComposites');

const ROOT = path.resolve(__dirname, '..');
const EST = path.join(ROOT, 'data', 'projects', 'duplex-lift-station.est.json');

describe('duplex lift station indicator cycle', () => {
  it('defines 24 total status steps across 4 station states', () => {
    assert.equal(DUPLEXLS_STATION_STATUS_STATES, 4);
    assert.equal(DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT, 24);
    assert.equal(DUPLEXLS_INDICATOR_CYCLE_MS, 24 * DUPLEXLS_INDICATOR_CYCLE_STEP_MS);
    assert.equal(listDuplexlsIndicatorCycleSteps().length, 24);
  });

  it('cycles STATION_STA 0..3 on every group block', () => {
    const stationSeq = listDuplexlsIndicatorCycleSteps().map((s) => s.stationSta);
    assert.deepEqual(stationSeq.slice(0, 4), [0, 1, 2, 3]);
    assert.deepEqual(stationSeq.slice(4, 8), [0, 1, 2, 3]);
    assert.deepEqual(stationSeq.slice(20, 24), [0, 1, 2, 3]);
  });

  it('writes starts and elapsed-time meter values on each step', () => {
    for (let step = 0; step < DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT; step += 1) {
      const { tagValues } = buildDuplexlsIndicatorCycleStep(step);
      assert.equal(tagValues.MOTOR1_STARTS, step + 1);
      assert.equal(tagValues.MOTOR2_STARTS, (step + 1) * 10);
      assert.equal(tagValues.MOTOR1_HRS, Number(((step + 1) * 10.5).toFixed(1)));
      assert.equal(tagValues.MOTOR2_HRS, Number(((step + 1) * 7.25).toFixed(1)));
      for (const tagId of DUPLEXLS_STARTS_TAGS) assert.ok(Number.isFinite(Number(tagValues[tagId])));
      for (const tagId of DUPLEXLS_ETM_TAGS) assert.ok(Number.isFinite(Number(tagValues[tagId])));
    }
  });

  it('lights one indicator group at a time', () => {
    const steps = listDuplexlsIndicatorCycleSteps();
    const groupIds = new Set(steps.map((s) => s.groupId));
    assert.equal(groupIds.size, 6);
    for (const s of steps) {
      const onCount = ['LVL_OFF', 'LVL_LEAD', 'LVL_LAG', 'LVL_HIGH', 'PHASE_FAULT',
        'GEN_RUN', 'GEN_FUEL_FAULT', 'GEN_FAULT', 'MOTOR1_RUN', 'MOTOR2_RUN']
        .filter((tagId) => s.tagValues[tagId]).length;
      assert.ok(onCount >= 1, `step ${s.step} should light at least one indicator`);
    }
  });

  it('runs async cycle with 1 second per step', async () => {
    const seen = [];
    const t0 = Date.now();
    await runDuplexlsIndicatorCycle((payload) => {
      seen.push(payload.step);
    }, { stepMs: 1 });
    assert.deepEqual(seen, Array.from({ length: 24 }, (_, i) => i));
    assert.ok(Date.now() - t0 >= 23);
  });

  it('maps live values for all four station status states', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const hmi = {
      screens: est.settings.hmi.screens,
      bindings: JSON.parse(JSON.stringify(est.settings.hmi.bindings)),
    };
    repairCompositeBindings(hmi, path.join(ROOT, 'public'));
    const binding = hmi.bindings.find(
      (b) => b.screenId === 'screen_2'
        && b.elementId === 't1_1_z0__lamp_status'
        && b.property === 'fill5',
    );
    assert.ok(binding, 'station status fill5 binding');
    assert.equal(binding.max - binding.min + 1, DUPLEXLS_STATION_STATUS_STATES);
    for (let sta = 0; sta < DUPLEXLS_STATION_STATUS_STATES; sta += 1) {
      const live = duplexlsIndicatorCycleLiveMap(sta);
      assert.equal(live.STATION_STA.value, sta);
      assert.ok(binding.colors[sta], `color for state ${sta}`);
    }
  });

  it('screen_2 display limits are 20% larger for viewport fill', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const screen = est.settings.hmi.screens.find((s) => s.id === 'screen_2');
    assert.ok(screen);
    assert.equal(screen.width, 1150);
    assert.equal(screen.height, 620);
    assert.equal(screen.displayMaxWidth, 1229);
    assert.equal(screen.displayMaxHeight, 922);
    assert.equal(screen.scale, 120);
  });
});
