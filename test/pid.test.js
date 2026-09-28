'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { updatePids, pidDisplayFb } = require('../src/engine/functionBlocks');
const { execute, createContext } = require('../src/engine/executor');
const { parseProgram } = require('../src/engine/parser');
const { TagStore } = require('../src/tags/tagStore');

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

  it('updatePids reads SP and PV from wired tag ids', () => {
    const spTag = { id: 'VPI2', type: 'INT', role: 'memory', value: 75 };
    const pvTag = { id: 'VPI1', type: 'INT', role: 'memory', value: 40 };
    const outTag = { id: 'VPR1', type: 'REAL', role: 'memory', value: 0 };
    const pid = {
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 0,
      mode: 'P',
      kp: 1,
      ki: 0,
      kd: 0,
      outMin: 0,
      outMax: 100,
      value: 0,
      fb: {
        pvId: 'VPI1',
        spId: 'VPI2',
        outId: 'VPR1',
        enabled: true,
        integral: 0,
        prevPv: null,
      },
    };
    updatePids([pid, spTag, pvTag, outTag], 100);
    assert.equal(pid.fb.sp, 75);
    assert.equal(pid.preset, 75);
    assert.equal(pid.fb.pv, 40);
    assert.equal(pid.fb.err, 35);
    assert.ok(outTag.value > 0);
  });

  it('TagStore persists PID PV/CV wire ids', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'VPI1', type: 'INT', role: 'memory', value: 0 },
      { id: 'VPR1', type: 'REAL', role: 'memory', value: 0 },
      {
        id: 'PID1',
        type: 'PID',
        role: 'fb',
        preset: 50,
        mode: 'PID',
        kp: 1,
        ki: 0,
        kd: 0,
        fb: { pvId: 'VPI1', spId: 'VPI2', outId: 'VPR1' },
      },
    ]);
    const pid = store.get('PID1');
    assert.equal(pid.fb.pvId, 'VPI1');
    assert.equal(pid.fb.spId, 'VPI2');
    assert.equal(pid.fb.outId, 'VPR1');
    store.replaceAll([
      { id: 'VPI1', type: 'INT', role: 'memory', value: 0 },
      { id: 'VPR2', type: 'REAL', role: 'memory', value: 0 },
      {
        id: 'PID1',
        type: 'PID',
        role: 'fb',
        preset: 50,
        mode: 'PID',
        kp: 1,
        ki: 0,
        kd: 0,
        fb: { pvId: 'VPI1', outId: 'VPR2' },
      },
    ]);
    assert.equal(store.get('PID1').fb.outId, 'VPR2');
  });

  it('TagStore persists PID gains and setpoint on replaceAll', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 75,
      mode: 'PI',
      kp: 0,
      ki: 0.25,
      kd: 1.5,
      outMin: 10,
      outMax: 90,
      fb: { pvId: 'VPI1', outId: 'VPR1' },
    }]);
    const pid = store.get('PID1');
    assert.equal(pid.preset, 75);
    assert.equal(pid.mode, 'PI');
    assert.equal(pid.kp, 0);
    assert.equal(pid.ki, 0.25);
    assert.equal(pid.kd, 1.5);
    assert.equal(pid.outMin, 10);
    assert.equal(pid.outMax, 90);
    assert.equal(pid.fb.sp, 75);
    assert.equal(pid.fb.pvId, 'VPI1');
  });

  it('updatePids drives hi/lo alarm VPB outputs from PV limits', () => {
    const hiAlm = { id: 'VPB5', type: 'BOOL', role: 'memory', value: false };
    const loAlm = { id: 'VPB6', type: 'BOOL', role: 'memory', value: false };
    const pvTag = { id: 'VPI1', type: 'INT', role: 'memory', value: 95 };
    const pid = {
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 50,
      mode: 'P',
      kp: 0,
      ki: 0,
      kd: 0,
      outMin: 0,
      outMax: 100,
      value: 0,
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 80,
      alarmOuterHigh: 100,
      fb: {
        pvId: 'VPI1',
        enabled: false,
        alarmHiId: 'VPB5',
        alarmLoId: 'VPB6',
      },
    };
    updatePids([pid, pvTag, hiAlm, loAlm], 100);
    assert.equal(pid.fb.alarmHi, true);
    assert.equal(pid.fb.alarmLo, false);
    assert.equal(hiAlm.value, true);
    assert.equal(loAlm.value, false);

    pvTag.value = 5;
    updatePids([pid, pvTag, hiAlm, loAlm], 100);
    assert.equal(pid.fb.alarmHi, false);
    assert.equal(pid.fb.alarmLo, true);
    assert.equal(hiAlm.value, false);
    assert.equal(loAlm.value, true);
  });

  it('pidDisplayFb reads wired PV/SP/CV and respects force values', () => {
    const pvTag = { id: 'VPI1', type: 'INT', role: 'memory', value: 10, forceOutput: true, forceValue: 33 };
    const spTag = { id: 'VPI2', type: 'INT', role: 'memory', value: 50 };
    const outTag = { id: 'VPR1', type: 'REAL', role: 'memory', value: 5, forceOutput: true, forceValue: 25 };
    const pid = {
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 0,
      fb: { pvId: 'VPI1', spId: 'VPI2', outId: 'VPR1', pv: 0, sp: 0, out: 0 },
    };
    const byId = new Map([pvTag, spTag, outTag, pid].map((t) => [t.id, t]));
    const fb = pidDisplayFb(pid, byId);
    assert.equal(fb.pv, 33);
    assert.equal(fb.sp, 50);
    assert.equal(fb.out, 25);
  });

  it('TagStore liveSnapshot exposes wired PID fields and forces', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'VPI1', type: 'INT', role: 'memory', value: 40 },
      { id: 'VPI2', type: 'INT', role: 'memory', value: 75 },
      { id: 'VPR1', type: 'REAL', role: 'memory', value: 12 },
      {
        id: 'PID1',
        type: 'PID',
        role: 'fb',
        preset: 0,
        fb: { pvId: 'VPI1', spId: 'VPI2', outId: 'VPR1', pv: 0, sp: 0, out: 0 },
      },
    ]);
    store.setForce('VPI1', { forceOutput: true, forceValue: 42 });
    store.setForce('VPR1', { forceOutput: true, forceValue: 25 });
    const snap = Object.fromEntries(store.liveSnapshot().map((e) => [e.tagId, e]));
    assert.equal(snap.PID1.fb.pv, 42);
    assert.equal(snap.PID1.fb.sp, 75);
    assert.equal(snap.PID1.fb.out, 25);
  });

  it('TagStore persists PID alarm wire ids', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'PID1',
      type: 'PID',
      role: 'fb',
      preset: 50,
      fb: { pvId: 'VPI1', alarmHiId: 'VPB5', alarmLoId: 'VPB6' },
    }]);
    const pid = store.get('PID1');
    assert.equal(pid.fb.alarmHiId, 'VPB5');
    assert.equal(pid.fb.alarmLoId, 'VPB6');
  });

  it('TagStore persists label and exposes it in liveSnapshot', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'DI1', type: 'BOOL', role: 'input', label: 'Pump run' },
      {
        id: 'PID1',
        type: 'PID',
        role: 'fb',
        label: 'LC-101',
        preset: 50,
        fb: { pvId: 'VPI1', outId: 'VPR1' },
      },
    ]);
    assert.equal(store.get('DI1').label, 'Pump run');
    assert.equal(store.get('PID1').label, 'LC-101');
    const snap = Object.fromEntries(store.liveSnapshot().map((e) => [e.tagId, e]));
    assert.equal(snap.DI1.label, 'Pump run');
    assert.equal(snap.PID1.label, 'LC-101');
  });
});
