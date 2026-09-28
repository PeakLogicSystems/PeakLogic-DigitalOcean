'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  FILTER_SLOTS_PER_DAY,
  FILTER_SCHEDULE_DAYS,
  buildScheduleTags,
  buildScheduleEvalSt,
  slotTagId,
} = require('../src/pool/filterPumpSchedule');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { ST_DIR } = require('../src/config');

describe('filterPumpSchedule', () => {
  it('builds weekly slot tags for pool and spa pumps', () => {
    const tags = buildScheduleTags(2);
    assert.ok(tags.find((t) => t.id === 'CFG_FP2'));
    assert.ok(tags.find((t) => t.id === 'SPA_TURNOVER_MIN'));
    assert.ok(tags.find((t) => t.id === 'FP2_D0_S1_T'));
    assert.ok(tags.find((t) => t.id === 'FP1_D0_S1_EN'));
    assert.equal(tags.filter((t) => t.id.startsWith('FP1_D')).length, FILTER_SCHEDULE_DAYS * FILTER_SLOTS_PER_DAY * 3);
    assert.equal(tags.filter((t) => t.id.startsWith('FP2_D')).length, FILTER_SCHEDULE_DAYS * FILTER_SLOTS_PER_DAY * 3);
  });

  it('computes turnover speed percent from volume and flow', () => {
    const { turnoverSpeedPct, DEFAULT_TURNOVER } = require('../src/pool/filterPumpSchedule');
    const dayPct = turnoverSpeedPct(DEFAULT_TURNOVER.poolVolGal, DEFAULT_TURNOVER.poolTurnoverDayMin, DEFAULT_TURNOVER.pump1FlowGpm);
    assert.ok(dayPct > 0 && dayPct <= 100);
    const spaPct = turnoverSpeedPct(DEFAULT_TURNOVER.spaVolGal, DEFAULT_TURNOVER.spaTurnoverMin, DEFAULT_TURNOVER.pump2FlowGpm);
    assert.ok(spaPct > 0 && spaPct <= 100);
  });

  it('generates valid ST eval block', () => {
    const st = buildScheduleEvalSt();
    assert.match(st, /FP1_D0_S1_T/);
    assert.match(st, /IsON\(FP1_D0_S1_EN\)/);
    assert.match(st, /FILTER_24HR/);
    const { errors } = parseProgram(st);
    assert.equal(errors.length, 0, errors.join('; '));
  });

  it('pool controller references schedule tags', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const ids = bundle.tags.map((t) => t.id);
    assert.ok(ids.includes('FP1_D0_S1_T'));
    assert.ok(ids.includes('FP1_D0_S1_EN'));
    assert.ok(ids.includes('FP1_D6_S6_P'));
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const errors = validateProgram(ast, ids);
    assert.equal(errors.length, 0, errors.join('; '));
  });
});
