'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');
const { repairSensorTestTags } = require('../src/programs/sensorTestTags');

describe('sensorTestTags', () => {
  it('repairs BOOL T1_F/T1_C to INT for SetInt / live display', () => {
    const store = new TagStore();
    store.tags.clear();
    store.upsert({ id: 'T1_F', type: 'BOOL', role: 'memory', value: false });
    store.upsert({ id: 'T1_C', type: 'BOOL', role: 'memory', value: false });
    store.upsert({ id: 'MOIST_PCT', type: 'BOOL', role: 'memory', value: false });
    const repaired = repairSensorTestTags(store);
    assert.ok(repaired.includes('T1_F'));
    assert.ok(repaired.includes('T1_C'));
    assert.equal(store.get('T1_F').type, 'INT');
    assert.equal(store.get('T1_C').type, 'INT');
    assert.equal(store.get('MOIST_PCT').type, 'INT');
    assert.equal(store.get('T1_F').value, 75);
  });
});
