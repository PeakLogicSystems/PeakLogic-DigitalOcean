'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { updateAlternators } = require('../src/engine/functionBlocks');
const { TagStore } = require('../src/tags/tagStore');

function loadDuplexTags() {
  const fixture = path.join(__dirname, '../st/fixtures/tags.duplex_lift_station.json');
  return JSON.parse(fs.readFileSync(fixture, 'utf8'));
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
  return row.type === 'INT' ? row.value : !!row.value;
}

function runDuplex(inputs = {}) {
  const src = fs.readFileSync(
    path.join(__dirname, '../st/logic/36_duplex_lift_station.st'),
    'utf8',
  );
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0);
  const tags = loadDuplexTags();
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

function runDuplexScan(inputs = {}) {
  const src = fs.readFileSync(
    path.join(__dirname, '../st/logic/36_duplex_lift_station.st'),
    'utf8',
  );
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0);
  const tags = loadDuplexTags();
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

describe('36_duplex_lift_station.st', () => {
  it('latches SYS_RUN and LEAD_CALL when lead and off floats are wet', () => {
    const tags = runDuplex({ X1_I2: true, X1_I4: true });
    assert.equal(tagValue(tags, 'SYS_RUN'), true);
    assert.equal(tagValue(tags, 'LVL_LEAD'), true);
    assert.equal(tagValue(tags, 'LVL_OFF'), true);
    assert.equal(tagValue(tags, 'LEAD_CALL'), true);
  });

  it('clears LEAD_CALL when off float is dry even if lead is wet', () => {
    const tags = runDuplex({ X1_I2: true, X1_I4: false });
    assert.equal(tagValue(tags, 'LVL_LEAD'), true);
    assert.equal(tagValue(tags, 'LVL_OFF'), false);
    assert.equal(tagValue(tags, 'LEAD_CALL'), false);
  });

  it('clears LEAD_CALL when phase fault is active even if floats demand run', () => {
    const tags = runDuplex({ X1_I2: true, X1_I4: true, X1_I7: true });
    assert.equal(tagValue(tags, 'PHASE_FAULT'), true);
    assert.equal(tagValue(tags, 'LEAD_CALL'), false);
    assert.equal(tagValue(tags, 'LAG_CALL'), false);
    assert.equal(tagValue(tags, 'ALT_OFF_REQ'), true);
    assert.equal(tagValue(tags, 'MASTER_OFF'), true);
  });

  it('energizes lead pump in Auto when off and lead floats are wet', () => {
    const tags = runDuplexScan({
      X1_I2: true,
      X1_I4: true,
      MOTOR1_HOA: 0,
      MOTOR2_HOA: 0,
    });
    assert.equal(tagValue(tags, 'ALT_OFF_REQ'), false);
    assert.equal(tagValue(tags, 'LEAD_CALL'), true);
    assert.equal(tagValue(tags, 'LEAD_RUN'), true);
    const p1 = tagValue(tags, 'P1_ALT_RUN');
    const p2 = tagValue(tags, 'P2_ALT_RUN');
    assert.equal(p1 || p2, true, 'alternator should run one lead pump');
    assert.equal(p1 && p2, false, 'lead-only stage runs one pump');
    const r1 = tagValue(tags, 'R1');
    const r2 = tagValue(tags, 'R2');
    assert.equal(r1 || r2, true, 'one contactor should energize');
    assert.equal(tagValue(tags, 'MOTOR1_RUN') || tagValue(tags, 'MOTOR2_RUN'), true);
  });

  it('sets LAG_RUN when lag demand runs lead and lag pumps', () => {
    const tags = runDuplexScan({
      X1_I2: true,
      X1_I3: true,
      X1_I4: true,
      MOTOR1_HOA: 0,
      MOTOR2_HOA: 0,
    });
    assert.equal(tagValue(tags, 'LAG_CALL'), true);
    assert.equal(tagValue(tags, 'LEAD_RUN'), true);
    assert.equal(tagValue(tags, 'LAG_RUN'), true);
    assert.equal(tagValue(tags, 'P1_ALT_RUN') && tagValue(tags, 'P2_ALT_RUN'), true);
  });

  it('does not treat wet off float as alternator off when LEAD_CALL is latched', () => {
    const tags = runDuplex({
      X1_I2: true,
      X1_I4: true,
    });
    assert.equal(tagValue(tags, 'LVL_OFF'), true);
    assert.equal(tagValue(tags, 'LEAD_CALL'), true);
    assert.equal(tagValue(tags, 'ALT_OFF_REQ'), false);
  });
});
