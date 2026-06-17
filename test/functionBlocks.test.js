'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  updateTimers, updateCounters, updateFlowMeters,
} = require('../src/engine/functionBlocks');

describe('timers', () => {
  it('TON completes after preset', () => {
    const tags = [{ type: 'TIMER', preset: 100, mode: 'TON', fb: { input: true, elapsed: 0 } }];
    updateTimers(tags, 50);
    updateTimers(tags, 60);
    assert.equal(tags[0].fb.done, true);
  });
});

describe('counters', () => {
  it('CTU increments on cu rising edge', () => {
    const tags = [{ type: 'COUNTER', preset: 3, mode: 'CTU', fb: { cu: false, count: 0 } }];
    tags[0].fb.cu = true;
    updateCounters(tags);
    assert.equal(tags[0].fb.count, 1);
    tags[0].fb.cu = true;
    updateCounters(tags);
    assert.equal(tags[0].fb.count, 1);
    tags[0].fb.cu = false;
    updateCounters(tags);
    tags[0].fb.cu = true;
    updateCounters(tags);
    assert.equal(tags[0].fb.count, 2);
  });
});

describe('flow meter', () => {
  it('computes GPM when 1-minute timer completes', () => {
    const tags = [
      { id: 'CTR1', type: 'COUNTER', preset: 99999, mode: 'CTU', fb: { count: 250, done: false } },
      { id: 'TMR1', type: 'TIMER', preset: 60000, mode: 'TON', fb: { input: true, elapsed: 60000, done: true, running: false, prevTmrDone: false } },
      { id: 'FLOW1', type: 'FLOW', preset: 100, mode: 'GPM', fb: { ctrId: 'CTR1', tmrId: 'TMR1', prevTmrDone: false, gpm: 0 } },
      { id: 'H2', type: 'INT', role: 'memory', value: 0 },
    ];
    tags[2].fb.outId = 'H2';
    updateFlowMeters(tags);
    assert.equal(tags[2].fb.gpm, 2.5);
    assert.equal(tags[2].fb.ready, true);
    assert.equal(tags[0].fb.reset, true);
    assert.equal(tags[1].fb.reset, true);
    assert.equal(tags[3].value, 2);
  });
});
