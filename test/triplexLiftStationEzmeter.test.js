'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { TagStore } = require('../src/tags/tagStore');

function loadTags() {
  const fixture = path.join(__dirname, '../st/fixtures/tags.triplex_lift_station_ezmeter.json');
  return JSON.parse(fs.readFileSync(fixture, 'utf8'));
}

function tagStoreFrom(list) {
  const store = new TagStore();
  store.replaceAll(list);
  return store;
}

function setReal(tags, id, value) {
  const row = tags.find((t) => t.id === id);
  if (row) row.value = value;
}

function setBool(tags, id, value) {
  const row = tags.find((t) => t.id === id);
  if (row) row.value = !!value;
}

function tagValue(tags, id) {
  const row = tags.find((t) => t.id === id);
  if (!row) return undefined;
  if (row.type === 'INT') return row.value;
  if (row.type === 'REAL') return row.value;
  return !!row.value;
}

function healthyPqInputs(overrides = {}) {
  return {
    DDS_V_A: 120,
    DDS_V_B: 119,
    DDS_V_C: 121,
    DDS_HZ_A: 60,
    MECH_PQ_CFG_UV_V: 108,
    MECH_PQ_CFG_NOM_V: 120,
    MECH_PQ_CFG_OV_V: 132,
    MECH_PQ_CFG_FREQ_MIN: 59.5,
    MECH_PQ_CFG_FREQ_MAX: 60.5,
    ...overrides,
  };
}

function runTriplex(inputs = {}) {
  const src = fs.readFileSync(
    path.join(__dirname, '../st/logic/39_triplex_lift_station_ezmeter.st'),
    'utf8',
  );
  const { ast, errors } = parseProgram(src);
  assert.equal(errors.length, 0);
  const tags = loadTags();
  for (const [id, value] of Object.entries(inputs)) {
    if (typeof value === 'number') setReal(tags, id, value);
    else setBool(tags, id, value);
  }
  const store = tagStoreFrom(tags);
  const ctx = createContext(store, new Set());
  execute(ast, ctx, []);
  return store.list();
}

describe('39_triplex_lift_station_ezmeter.st', () => {
  it('drives R4 ON for high level float', () => {
    const tags = runTriplex({ X1_I1: true });
    assert.equal(tagValue(tags, 'LVL_HIGH'), true);
    assert.equal(tagValue(tags, 'R4'), true);
  });

  it('drives R4 ON for MECH_PQ alarm', () => {
    const tags = runTriplex(healthyPqInputs({
      DDS_V_A: 100,
      DDS_V_B: 120,
      DDS_V_C: 120,
    }));
    assert.equal(tagValue(tags, 'MECH_PQ_ALM'), true);
    assert.equal(tagValue(tags, 'R4'), true);
  });

  it('drives R4 ON for pump 3 motor fault X1_I15', () => {
    const tags = runTriplex(healthyPqInputs({ X1_I15: true }));
    assert.equal(tagValue(tags, 'MOTOR3_FAULT'), true);
    assert.equal(tagValue(tags, 'R4'), true);
  });

  it('clears R4 when no alarm conditions are active', () => {
    const tags = runTriplex(healthyPqInputs());
    assert.equal(tagValue(tags, 'MECH_PQ_ALM'), false);
    assert.equal(tagValue(tags, 'R4'), false);
  });
});
