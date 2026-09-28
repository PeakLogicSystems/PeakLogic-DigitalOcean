'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isIoMapTag, isExpansionIoTag, sortIoMapTags, ioMapPointFromTag } = require('../src/api/routes/ioMap');

describe('ioMap', () => {
  it('filters input and output tags only', () => {
    assert.equal(isIoMapTag({ id: 'I1', role: 'input' }), true);
    assert.equal(isIoMapTag({ id: 'R1', role: 'output' }), true);
    assert.equal(isIoMapTag({ role: 'memory' }), false);
  });

  it('includes expansion module tags (Xn_ prefix)', () => {
    assert.equal(isExpansionIoTag({ id: 'X1_I1' }), true);
    assert.equal(isExpansionIoTag({ id: 'X2_R3' }), true);
    assert.equal(isExpansionIoTag({ id: 'X2_AI1' }), true);
    assert.equal(isExpansionIoTag({ id: 'X1_IRAW16' }), true);
    assert.equal(isExpansionIoTag({ id: 'I1' }), false);
    assert.equal(isExpansionIoTag({ id: 'R4' }), false);
    assert.equal(isIoMapTag({ id: 'X1_I1', role: 'input' }), true);
    assert.equal(isIoMapTag({ id: 'X2_PWM1', role: 'output' }), true);
    assert.equal(isIoMapTag({ id: 'I1', role: 'input' }), true);
  });

  it('sorts on-board tags before expansion slots', () => {
    const tags = [
      { id: 'X1_I1', role: 'input', type: 'BOOL' },
      { id: 'I1', role: 'input', type: 'BOOL' },
      { id: 'X2_AI1', role: 'input', type: 'REAL' },
    ];
    const sorted = tags.slice().sort(sortIoMapTags);
    assert.deepEqual(sorted.map((t) => t.id), ['I1', 'X1_I1', 'X2_AI1']);
  });

  it('sorts inputs before outputs, then by type and id', () => {
    const tags = [
      { id: 'R1', role: 'output', type: 'BOOL' },
      { id: 'I2', role: 'input', type: 'BOOL' },
      { id: 'AI1', role: 'input', type: 'INT' },
      { id: 'I1', role: 'input', type: 'BOOL' },
    ];
    const sorted = tags.slice().sort(sortIoMapTags);
    assert.deepEqual(sorted.map((t) => t.id), ['I1', 'I2', 'AI1', 'R1']);
  });

  it('maps tag fields for API response', () => {
    const p = ioMapPointFromTag({
      id: 'I1',
      label: 'Start',
      type: 'BOOL',
      role: 'input',
      value: true,
      quality: 'GOOD',
      driverId: 'opta_01',
      forceInput: false,
      forceOutput: false,
      updatedAt: 1_700_000_000_000,
    });
    assert.equal(p.id, 'I1');
    assert.equal(p.label, 'Start');
    assert.equal(p.driverId, 'opta_01');
    assert.equal(p.value, true);
    assert.equal(p.quality, 'GOOD');
    assert.equal(p.updatedAt, 1_700_000_000_000);
  });

  it('defaults missing per-point updatedAt to null', () => {
    const p = ioMapPointFromTag({ id: 'I1', type: 'BOOL', role: 'input', value: false });
    assert.equal(p.updatedAt, null);
  });

  it('passes uppercase quality from tag store unchanged', () => {
    const p = ioMapPointFromTag({
      id: 'DI1',
      type: 'BOOL',
      role: 'input',
      value: false,
      quality: 'BAD',
    });
    assert.equal(p.quality, 'BAD');
  });
});
