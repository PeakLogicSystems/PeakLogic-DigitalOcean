'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  nextMemoryTagId,
  nextFbTagId,
  applyMemoryTagNaming,
  applyFbTagNaming,
  applyTagNaming,
  isValidMemoryTagId,
  isValidFbTagId,
  normalizeWordWidth,
  formatWordWidthLabel,
} = require('../src/tags/tagNaming');

describe('tagNaming', () => {
  const tags = [
    { id: 'VPB1' },
    { id: 'VPB3' },
    { id: 'VPI1' },
    { id: 'TMR' },
    { id: 'CTR2' },
  ];

  it('allocates next VPB id', () => {
    assert.equal(nextMemoryTagId(tags, 'BOOL'), 'VPB4');
  });

  it('allocates next VPI id', () => {
    assert.equal(nextMemoryTagId(tags, 'INT'), 'VPI2');
  });

  it('keeps suffix when memory type changes VPB to VPI', () => {
    assert.equal(applyMemoryTagNaming('VPB7', 'INT', 'memory', tags), 'VPI7');
  });

  it('assigns prefix for new memory tag with generic id', () => {
    assert.equal(applyMemoryTagNaming('TAG_0', 'REAL', 'memory', tags), 'VPR1');
  });

  it('does not rename input/output tags', () => {
    assert.equal(applyMemoryTagNaming('DI1', 'BOOL', 'input', tags), 'DI1');
  });

  it('validates memory prefix', () => {
    assert.equal(isValidMemoryTagId('VPB12', 'BOOL'), true);
    assert.equal(isValidMemoryTagId('VPI12', 'BOOL'), false);
  });

  it('allocates first timer as TMR', () => {
    assert.equal(nextFbTagId([], 'TIMER'), 'TMR');
  });

  it('allocates TMR1 when bare TMR exists', () => {
    assert.equal(nextFbTagId(tags, 'TIMER'), 'TMR1');
  });

  it('allocates next CTR id', () => {
    assert.equal(nextFbTagId(tags, 'COUNTER'), 'CTR3');
  });

  it('keeps TMR suffix when switching timer to counter', () => {
    assert.equal(applyFbTagNaming('TMR5', 'COUNTER', tags), 'CTR5');
  });

  it('does not apply VPB naming to TIMER memory role', () => {
    assert.equal(applyTagNaming('TAG_9', 'TIMER', 'memory', tags), 'TMR1');
    assert.equal(applyTagNaming('VPB2', 'TIMER', 'memory', tags), 'TMR2');
  });

  it('validates TMR/CTR ids', () => {
    assert.equal(isValidFbTagId('TMR', 'TIMER'), true);
    assert.equal(isValidFbTagId('CTR12', 'COUNTER'), true);
    assert.equal(isValidFbTagId('VPB1', 'TIMER'), false);
  });

  it('allocates first PID as PID', () => {
    assert.equal(nextFbTagId([], 'PID'), 'PID');
    assert.equal(nextFbTagId([{ id: 'PID' }], 'PID'), 'PID1');
  });

  it('allocates first AVG as AVG', () => {
    assert.equal(nextFbTagId([], 'AVG'), 'AVG');
    assert.equal(nextFbTagId([{ id: 'AVG' }], 'AVG'), 'AVG1');
  });

  it('normalizes word width to 16 or 32 for timer/counter', () => {
    assert.equal(normalizeWordWidth('TIMER', 8), 16);
    assert.equal(normalizeWordWidth('COUNTER', 64), 32);
    assert.equal(formatWordWidthLabel('TIMER', 32), '32-bit');
    assert.equal(formatWordWidthLabel('COUNTER', 16), '16-bit');
  });
});
