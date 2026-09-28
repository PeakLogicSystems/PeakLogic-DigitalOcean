'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isProgramIoTag,
  isHardwareIoTag,
  programIoTagList,
} = require('../src/programIoTags');

describe('programIoTags', () => {
  it('includes hardware input/output tags when program has refs', () => {
    const tags = [
      { id: 'DI1', type: 'BOOL', role: 'input', driverId: 'mbus', driverAddress: { table: 'discrete', address: 0, slaveId: 1 } },
      { id: 'DI17', type: 'BOOL', role: 'input', driverId: 'mbus', driverAddress: { table: 'discrete', address: 0, slaveId: 2 } },
      { id: 'VPB1', type: 'BOOL', role: 'memory' },
      { id: 'R1', type: 'BOOL', role: 'output', driverId: 'opta' },
      { id: 'X1_I1', type: 'BOOL', role: 'input', driverId: 'opta' },
    ];
    const refs = ['VPB1'];
    const list = programIoTagList(tags, refs);
    assert.deepEqual(list.map((t) => t.id).sort(), ['DI1', 'DI17', 'R1', 'VPB1', 'X1_I1'].sort());
  });

  it('excludes memory tags not referenced in program', () => {
    const tags = [
      { id: 'VPB1', type: 'BOOL', role: 'memory' },
      { id: 'VPB2', type: 'BOOL', role: 'memory' },
    ];
    const list = programIoTagList(tags, ['VPB1']);
    assert.deepEqual(list.map((t) => t.id), ['VPB1']);
  });

  it('includes all program I/O types when no program refs', () => {
    assert.equal(isProgramIoTag({ id: 'VPB1', type: 'BOOL', role: 'memory' }), true);
    assert.equal(isHardwareIoTag({ id: 'DI1', type: 'BOOL', role: 'input' }), true);
    assert.equal(isHardwareIoTag({ id: 'VPB1', type: 'BOOL', role: 'memory' }), false);
  });

  it('deduplicates tags by id', () => {
    const tags = [
      { id: 'DI1', type: 'BOOL', role: 'input' },
      { id: 'DI1', type: 'BOOL', role: 'input' },
    ];
    const list = programIoTagList(tags, ['DI1']);
    assert.equal(list.length, 1);
  });
});
