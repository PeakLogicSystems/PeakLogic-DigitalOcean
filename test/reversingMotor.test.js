'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { updateReversingMotors } = require('../src/engine/functionBlocks');

function makeRmtTags(extra = []) {
  return [
    {
      id: 'RMOTOR1',
      type: 'RMOTOR',
      role: 'fb',
      mode: 'RMOTOR',
      preset: 500,
      value: 0,
      fb: {},
    },
    { id: 'FWD_CMD', type: 'BOOL', role: 'memory', value: false },
    { id: 'REV_CMD', type: 'BOOL', role: 'memory', value: false },
    { id: 'FWD_AUX', type: 'BOOL', role: 'memory', value: false },
    { id: 'REV_AUX', type: 'BOOL', role: 'memory', value: false },
    { id: 'OVL', type: 'BOOL', role: 'memory', value: false },
    { id: 'HOA', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'FWD_OUT', type: 'BOOL', role: 'memory', value: false },
    { id: 'REV_OUT', type: 'BOOL', role: 'memory', value: false },
    { id: 'STA', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'HRS', type: 'REAL', role: 'memory', value: 0 },
    { id: 'STARTS', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'RESET', type: 'BOOL', role: 'memory', value: false },
    { id: 'OFFLINE', type: 'BOOL', role: 'memory', value: false },
    ...extra,
  ];
}

function wireRmt(fb) {
  fb.fwdCmdId = 'FWD_CMD';
  fb.revCmdId = 'REV_CMD';
  fb.fwdAuxId = 'FWD_AUX';
  fb.revAuxId = 'REV_AUX';
  fb.overloadId = 'OVL';
  fb.hoaId = 'HOA';
  fb.fwdOutId = 'FWD_OUT';
  fb.revOutId = 'REV_OUT';
  fb.staOutId = 'STA';
  fb.hrsOutId = 'HRS';
  fb.startsOutId = 'STARTS';
  fb.resetId = 'RESET';
  fb.offlineId = 'OFFLINE';
}

function tagStoreFrom(list) {
  const map = new Map(list.map((t) => [t.id, t]));
  return {
    get(id) { return map.get(id) || null; },
    list() { return list; },
    setValue(id, val) {
      const t = map.get(id);
      if (t) t.value = val;
    },
    markDirty() {},
  };
}

function idx(tags, id) {
  return tags.findIndex((t) => t.id === id);
}

describe('reversing motor', () => {
  it('runs forward when fwd command active', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'FWD_CMD')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, true);
    assert.equal(tags[idx(tags, 'REV_OUT')].value, false);
    assert.equal(tags[0].fb.status, 1);
    assert.equal(tags[idx(tags, 'STA')].value, 1);
  });

  it('runs reverse when rev command active', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'REV_CMD')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, false);
    assert.equal(tags[idx(tags, 'REV_OUT')].value, true);
    assert.equal(tags[0].fb.status, 2);
  });

  it('faults when fwd and rev commanded together', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'FWD_CMD')].value = true;
    tags[idx(tags, 'REV_CMD')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[0].fb.fault, true);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, false);
    assert.equal(tags[idx(tags, 'REV_OUT')].value, false);
    assert.equal(tags[0].fb.status, 3);
  });

  it('faults on overload', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'FWD_CMD')].value = true;
    tags[idx(tags, 'OVL')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[0].fb.fault, true);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, false);
  });

  it('blocks run when HOA is Off', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'HOA')].value = 1;
    tags[idx(tags, 'FWD_CMD')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, false);
    assert.equal(tags[0].fb.status, 0);
  });

  it('enforces reversal deadtime before switching direction', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[0].preset = 200;
    wireRmt(tags[0].fb);
    tags[idx(tags, 'FWD_CMD')].value = true;
    updateReversingMotors(tags, 100);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, true);

    tags[idx(tags, 'FWD_CMD')].value = false;
    tags[idx(tags, 'REV_CMD')].value = true;
    updateReversingMotors(tags, 50);
    assert.equal(tags[idx(tags, 'FWD_OUT')].value, false);
    assert.equal(tags[idx(tags, 'REV_OUT')].value, false);
    assert.equal(tags[0].fb.reversing, true);
    assert.equal(tags[0].fb.status, 5);

    updateReversingMotors(tags, 200);
    assert.equal(tags[idx(tags, 'REV_OUT')].value, true);
    assert.equal(tags[0].fb.status, 2);
  });

  it('accumulates hours and start count while running', () => {
    const tags = makeRmtTags();
    wireRmt(tags[0].fb);
    tags[idx(tags, 'FWD_CMD')].value = true;
    updateReversingMotors(tags, 3600000);
    assert.ok(tags[0].fb.hours >= 0.99);
    assert.equal(tags[0].fb.starts, 1);
    assert.equal(tags[idx(tags, 'STARTS')].value, 1);
  });

  it('parses and wires RMOTOR via ST', () => {
    const src = `
RmtFwdCmd(RMOTOR1, FWD_CMD);
RmtRevCmd(RMOTOR1, REV_CMD);
RmtFwdOut(RMOTOR1, FWD_OUT);
RmtRevOut(RMOTOR1, REV_OUT);
RmtOverload(RMOTOR1, OVL);
RmtHoa(RMOTOR1, HOA);
`;
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    const tags = makeRmtTags();
    const store = tagStoreFrom(tags);
    execute(ast, createContext(store), []);
    assert.equal(tags[0].fb.fwdCmdId, 'FWD_CMD');
    assert.equal(tags[0].fb.revCmdId, 'REV_CMD');
    assert.equal(tags[0].fb.fwdOutId, 'FWD_OUT');
    assert.equal(tags[0].fb.overloadId, 'OVL');
    assert.equal(tags[0].fb.hoaId, 'HOA');
  });
});
