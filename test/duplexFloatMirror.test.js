'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const { mirrorDuplexFloatLevels } = require('../src/parc/duplexFloatMirror');

describe('duplexFloatMirror', () => {
  it('maps active-high X1_I* to LVL_* (+24 V / IsON convention)', () => {
    const store = new TagStore();
    for (const id of ['X1_I1', 'X1_I2', 'X1_I3', 'X1_I4']) {
      store.upsert({ id, type: 'BOOL', role: 'input', value: false });
    }
    for (const id of ['LVL_HIGH', 'LVL_LEAD', 'LVL_LAG', 'LVL_OFF']) {
      store.upsert({ id, type: 'BOOL', role: 'memory', value: false });
    }
    store.setValue('X1_I2', true);
    store.setValue('X1_I1', true);
    store.setValue('X1_I4', true);
    mirrorDuplexFloatLevels(store);
    assert.equal(store.get('LVL_LEAD').value, true);
    assert.equal(store.get('LVL_LAG').value, false);
    assert.equal(store.get('LVL_HIGH').value, true);
    assert.equal(store.get('LVL_OFF').value, true);
  });

  it('latches LEAD_CALL when lead and off floats are wet', () => {
    const store = new TagStore();
    for (const id of ['X1_I1', 'X1_I2', 'X1_I3', 'X1_I4']) {
      store.upsert({ id, type: 'BOOL', role: 'input', value: false });
    }
    for (const id of ['LVL_HIGH', 'LVL_LEAD', 'LVL_LAG', 'LVL_OFF', 'LEAD_CALL', 'LAG_CALL']) {
      store.upsert({ id, type: 'BOOL', role: 'memory', value: false });
    }
    store.setValue('X1_I2', true);
    store.setValue('X1_I4', true);
    mirrorDuplexFloatLevels(store);
    assert.equal(store.get('LEAD_CALL').value, true);
    assert.equal(store.get('LAG_CALL').value, false);
  });

  it('clears LEAD_CALL when off float is dry even if lead stays wet', () => {
    const store = new TagStore();
    for (const id of ['X1_I1', 'X1_I2', 'X1_I3', 'X1_I4']) {
      store.upsert({ id, type: 'BOOL', role: 'input', value: false });
    }
    for (const id of ['LVL_HIGH', 'LVL_LEAD', 'LVL_LAG', 'LVL_OFF', 'LEAD_CALL', 'LAG_CALL']) {
      store.upsert({ id, type: 'BOOL', role: 'memory', value: false });
    }
    store.setValue('X1_I2', true);
    store.setValue('X1_I4', false);
    mirrorDuplexFloatLevels(store);
    assert.equal(store.get('LEAD_CALL').value, false);
  });

  it('clears LEAD_CALL when phase fault input is active', () => {
    const store = new TagStore();
    for (const id of ['X1_I1', 'X1_I2', 'X1_I3', 'X1_I4', 'X1_I7']) {
      store.upsert({ id, type: 'BOOL', role: 'input', value: false });
    }
    for (const id of ['LVL_HIGH', 'LVL_LEAD', 'LVL_LAG', 'LVL_OFF', 'LEAD_CALL', 'LAG_CALL']) {
      store.upsert({ id, type: 'BOOL', role: 'memory', value: false });
    }
    store.setValue('X1_I2', true);
    store.setValue('X1_I4', true);
    store.setValue('X1_I7', true);
    mirrorDuplexFloatLevels(store);
    assert.equal(store.get('LEAD_CALL').value, false);
  });
});
