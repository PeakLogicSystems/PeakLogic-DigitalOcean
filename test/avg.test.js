'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { updateAverages } = require('../src/engine/functionBlocks');
const { execute, createContext } = require('../src/engine/executor');
const { parseProgram } = require('../src/engine/parser');

function mockStore(tags) {
  const map = new Map(tags.map((t) => [t.id, t]));
  return {
    list: () => [...map.values()],
    get: (id) => map.get(id) || null,
    setValue(id, value) {
      const t = map.get(id);
      if (t) t.value = value;
      return true;
    },
    markDirty() {},
  };
}

describe('AVG function block', () => {
  it('computes moving average over window', () => {
    const avg = {
      id: 'AVG1',
      type: 'AVG',
      role: 'fb',
      preset: 4,
      mode: 'MOV',
      value: 0,
      fb: { pv: 0, avg: 0, sum: 0, count: 0, ready: false, samples: [], reset: false },
    };
    const inputs = [10, 20, 30, 40];
    for (const v of inputs) {
      avg.fb.pv = v;
      updateAverages([avg]);
    }
    assert.equal(avg.fb.avg, 25);
    assert.equal(avg.fb.count, 4);
    assert.equal(avg.fb.ready, true);
  });

  it('AvgIn and AvgOut wire tags in ST', () => {
    const avg = {
      id: 'AVG1',
      type: 'AVG',
      role: 'fb',
      preset: 2,
      mode: 'MOV',
      value: 0,
      fb: { pv: 0, avg: 0, samples: [], reset: false },
    };
    const ai = { id: 'AI1', type: 'REAL', role: 'input', value: 42 };
    const out = { id: 'VPR1', type: 'REAL', role: 'memory', value: 0 };
    const store = mockStore([avg, ai, out]);
    const { ast } = parseProgram('AvgIn(AVG1, AI1); AvgOut(AVG1, VPR1);');
    execute(ast, createContext(store));
    updateAverages(store.list());
    execute(ast, createContext(store));
    assert.equal(avg.fb.pv, 42);
    assert.equal(avg.fb.avg, 42);
    assert.equal(out.value, 42);
  });
});
