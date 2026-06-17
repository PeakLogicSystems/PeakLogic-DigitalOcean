'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  buildDefaultMemoryTags,
  mergeDefaultMemoryTags,
  DEFAULT_VPB_COUNT,
  DEFAULT_VPI_COUNT,
  DEFAULT_VPR_COUNT,
} = require('../src/tags/defaultMemoryTags');

describe('defaultMemoryTags', () => {
  it('builds 20 VPB, 1 VPI, 1 VPR', () => {
    const tags = buildDefaultMemoryTags();
    assert.equal(tags.length, DEFAULT_VPB_COUNT + DEFAULT_VPI_COUNT + DEFAULT_VPR_COUNT);
    assert.equal(tags.filter((t) => t.id.startsWith('VPB')).length, DEFAULT_VPB_COUNT);
    assert.equal(tags.find((t) => t.id === 'VPB1').type, 'BOOL');
    assert.equal(tags.find((t) => t.id === 'VPI1').type, 'INT');
    assert.equal(tags.find((t) => t.id === 'VPI1').value, 1);
    assert.equal(tags.find((t) => t.id === 'VPR1').type, 'REAL');
    assert.equal(tags.find((t) => t.id === 'VPR1').value, 1);
    assert.ok(tags.every((t) => t.role === 'memory'));
  });

  it('merge adds only missing default ids', () => {
    const merged = mergeDefaultMemoryTags([
      { id: 'DI', type: 'BOOL', role: 'input' },
      { id: 'VPB1', type: 'BOOL', role: 'memory' },
    ]);
    assert.equal(merged.length, 2 + (DEFAULT_VPB_COUNT + DEFAULT_VPI_COUNT + DEFAULT_VPR_COUNT - 1));
    assert.ok(merged.some((t) => t.id === 'DI'));
    assert.ok(merged.some((t) => t.id === 'VPB20'));
    assert.ok(merged.some((t) => t.id === 'VPR1'));
  });
});
