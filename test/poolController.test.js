'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFixtureBundle } = require('../src/programs/programFixtures');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { execute, createContext } = require('../src/engine/executor');
const { updateTimers, updateCounters, updateFlowMeters } = require('../src/engine/functionBlocks');
const { TagStore } = require('../src/tags/tagStore');

describe('pool_controller fixture', () => {
  it('loads merged tags for pool controller program', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    assert.ok(bundle);
    const ids = bundle.tags.map((t) => t.id);
    assert.ok(ids.includes('PID_PH'));
    assert.ok(ids.includes('DOSE_CL'));
    assert.ok(ids.includes('PUMP_RUN_CMD'));
    assert.ok(ids.includes('POOL_BW_STA'));
    assert.ok(ids.includes('LIGHT_Z1'));
    assert.ok(ids.includes('LIGHT_OP'));
    assert.ok(ids.includes('BW_VALVE_BW'));
    assert.ok(ids.includes('BW_VLV1_CMD'));
    assert.ok(ids.includes('VLV1_AT_POS'));
    assert.ok(ids.includes('POOL_CFG_PENTAIR_VLV'));
    assert.ok(ids.includes('FP1_D0_S1_T'));
    assert.ok(ids.includes('FP2_D0_S1_T'));
    assert.ok(ids.includes('CFG_FP2'));
    assert.ok(ids.includes('SCH_AUTO_TURNOVER'));
    assert.ok(ids.includes('POOL_FLOW_PULSE'));
    assert.ok(ids.includes('FLOW_FB'));
    assert.ok(ids.includes('FLOW_GPM'));
    assert.ok(ids.includes('FLOW_K_FACTOR'));
    assert.equal(bundle.tagsFile, 'tags.pool_controller.json');
  });

  it('validates pool controller ST program', () => {
    const { ST_DIR } = require('../src/config');
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const errors = validateProgram(ast, bundle.tags.map((t) => t.id));
    assert.equal(errors.length, 0, errors.join('; '));
  });

  it('flow permissive from debounced flow switch when meter disabled', () => {
    const { ST_DIR } = require('../src/config');
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const store = new TagStore();
    store.replaceAll(bundle.tags.map((t) => ({ ...t })));
    const src = fs.readFileSync(path.join(ST_DIR, 'logic', '30_pool_controller.st'), 'utf8');
    const { ast } = parseProgram(src);
    const fired = new Set();

    store.get('POOL_FLOW_METER_EN').value = false;
    store.get('POOL_FLOW_SW').value = true;
    store.get('POOL_EN').value = true;

    for (let i = 0; i < 120; i++) {
      execute(ast, createContext(store, fired), []);
      updateTimers(store.list(), 50);
      updateCounters(store.list());
      updateFlowMeters(store.list());
    }

    assert.equal(store.get('POOL_FLOW_OK').value, true);
    assert.equal(store.get('ALM_FLOW_LO').value, false);
  });

  it('flow permissive from meter GPM when above minimum', () => {
    const bundle = loadFixtureBundle('logic/30_pool_controller.st', []);
    const store = new TagStore();
    store.replaceAll(bundle.tags.map((t) => ({ ...t })));
    const fired = new Set();

    store.get('POOL_FLOW_METER_EN').value = true;
    store.get('POOL_FLOW_SW').value = false;
    store.get('FLOW_GPM').value = 25;
    store.get('FLOW_MIN_GPM').value = 10;

    const snippet = parseProgram(`
      IF (IsON(POOL_FLOW_METER_EN) AND FLOW_GPM >= FLOW_MIN_GPM) OR TimerDone(TMR_FLOW) THEN
        TurnON(POOL_FLOW_OK);
      ELSE
        TurnOFF(POOL_FLOW_OK);
      END_IF;
      IF IsOFF(POOL_FLOW_OK) THEN TurnON(ALM_FLOW_LO); ELSE TurnOFF(ALM_FLOW_LO); END_IF;
    `).ast;

    execute(snippet, createContext(store, fired), []);

    assert.equal(store.get('POOL_FLOW_OK').value, true);
    assert.equal(store.get('ALM_FLOW_LO').value, false);
  });
});
