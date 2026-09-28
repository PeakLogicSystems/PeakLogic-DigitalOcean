'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { updateAlternators } = require('../src/engine/functionBlocks');
const { TagStore } = require('../src/tags/tagStore');

const ST = path.join(__dirname, '../st/logic/37_duplex_lift_station_parc_st.st');
const FIXTURE = path.join(__dirname, '../st/fixtures/tags.duplex_lift_station_parc_st.json');

function loadTags() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

function tagStoreFrom(list) {
  const store = new TagStore();
  store.replaceAll(list);
  return store;
}

function setBool(tags, id, value) {
  const row = tags.find((t) => t.id === id);
  if (row) row.value = !!value;
}

function tagValue(tags, id) {
  const row = tags.find((t) => t.id === id);
  if (!row) return undefined;
  return row.type === 'INT' || row.type === 'REAL' ? row.value : !!row.value;
}

function runOnce(inputs = {}) {
  const src = fs.readFileSync(ST, 'utf8');
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0, errors.map((e) => e.message || e).join('; '));
  const tags = loadTags();
  for (const [id, value] of Object.entries(inputs)) {
    if (typeof value === 'number') {
      const row = tags.find((t) => t.id === id);
      if (row) row.value = value;
    } else {
      setBool(tags, id, value);
    }
  }
  const store = tagStoreFrom(tags);
  const ctx = createContext(store, new Set());
  execute(ast, ctx, []);
  return store.list();
}

function runScan(inputs = {}) {
  const src = fs.readFileSync(ST, 'utf8');
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0);
  const tags = loadTags();
  for (const [id, value] of Object.entries(inputs)) {
    if (typeof value === 'number') {
      const row = tags.find((t) => t.id === id);
      if (row) row.value = value;
    } else {
      setBool(tags, id, value);
    }
  }
  const store = tagStoreFrom(tags);
  const ctx = createContext(store, new Set());
  execute(ast, ctx, []);
  updateAlternators(store.list());
  execute(ast, ctx, []);
  return store.list();
}

describe('37_duplex_lift_station_parc_st.st', () => {
  it('maps I1=OFF I2=LEAD I3=LAG I4=HIGH', () => {
    const tags = runOnce({ I1: true, I2: true, I3: true, I4: true });
    assert.equal(tagValue(tags, 'LVL_OFF'), true);
    assert.equal(tagValue(tags, 'LVL_LEAD'), true);
    assert.equal(tagValue(tags, 'LVL_LAG'), true);
    assert.equal(tagValue(tags, 'LVL_HIGH'), true);
  });

  it('latches LEAD_CALL when lead+off wet', () => {
    const tags = runOnce({ I1: true, I2: true });
    assert.equal(tagValue(tags, 'LEAD_CALL'), true);
    assert.equal(tagValue(tags, 'ALT_OFF_REQ'), false);
  });

  it('clears LEAD_CALL when off float dry', () => {
    const tags = runOnce({ I1: false, I2: true });
    assert.equal(tagValue(tags, 'LEAD_CALL'), false);
  });

  it('energizes one pump relay in Auto on lead demand', () => {
    const tags = runScan({ I1: true, I2: true, MOTOR1_HOA: 0, MOTOR2_HOA: 0 });
    assert.equal(tagValue(tags, 'R1') || tagValue(tags, 'R2'), true);
    assert.equal(tagValue(tags, 'R1') && tagValue(tags, 'R2'), false);
  });

  it('drives R3 on high level alarm', () => {
    const tags = runOnce({ I1: true, I4: true });
    assert.equal(tagValue(tags, 'LVL_HIGH'), true);
    assert.equal(tagValue(tags, 'R3'), true);
  });
});
