'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { updatePids } = require('../src/engine/functionBlocks');
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

describe('PID function block', () => {
  it('computes P-mode output from error', () => {
    const pid = {
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 50,
      mode: 'P',
      kp: 2,
      ki: 0,
      kd: 0,
      outMin: 0,
      outMax: 100,
      value: 0,
      fb: { pv: 10, sp: 50, out: 0, err: 0, integral: 0, prevPv: 10, enabled: true },
    };
    updatePids([pid], 100);
    assert.equal(pid.fb.err, 40);
    assert.equal(pid.fb.out, 80);
  });

  it('PidPv and PidOut wire tags in ST', () => {
    const pid = {
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 50,
      mode: 'P',
      kp: 2,
      ki: 0,
      kd: 0,
      outMin: 0,
      outMax: 100,
      value: 0,
      fb: { pv: 0, sp: 50, out: 0, err: 0, integral: 0, prevPv: null, enabled: true },
    };
    const pv = { id: 'AI1', type: 'REAL', role: 'input', value: 40 };
    const ao = { id: 'AO1', type: 'REAL', role: 'output', value: 0, dirty: false };
    const store = mockStore([pid, pv, ao]);
    const src = `
      PidPv(PID1, AI1);
      PidAuto(PID1);
      PidOut(PID1, AO1);
    `;
    const { ast } = parseProgram(src);
    execute(ast, createContext(store));
    updatePids(store.list(), 100);
    execute(ast, createContext(store));
    assert.equal(pid.fb.pv, 40);
    assert.ok(ao.value > 0);
  });
});
