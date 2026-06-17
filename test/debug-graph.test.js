'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GraphHistory } = require('../src/runtime/graphHistory');
const { TagStore } = require('../src/tags/tagStore');

describe('graphHistory', () => {
  it('records INT/REAL samples', () => {
    const g = new GraphHistory(10);
    g.record([{ id: 'AI1', type: 'REAL', value: 1, wordWidth: 16 }]);
    g.record([{ id: 'AI1', type: 'REAL', value: 2, wordWidth: 16 }]);
    const h = g.getHistory(['AI1'], 5);
    assert.equal(h.AI1.length, 2);
  });
});

describe('force', () => {
  it('sets force input', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'DI', type: 'BOOL', role: 'input', value: false }]);
    store.setForce('DI', { forceInput: true, forceValue: true });
    store.applyForcesAfterRead();
    assert.equal(store.get('DI').value, true);
  });

  it('replaceAll preserves active force state', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'Q', type: 'BOOL', role: 'output', value: false }]);
    store.setForce('Q', { forceOutput: true, forceValue: true });
    store.replaceAll([{ id: 'Q', type: 'BOOL', role: 'output', value: false, driverId: null }]);
    const t = store.get('Q');
    assert.equal(t.forceOutput, true);
    assert.equal(t.value, true);
  });
});
