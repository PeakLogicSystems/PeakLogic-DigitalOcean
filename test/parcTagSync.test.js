'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeParcTagsIntoStore, parcRowToStoreTag } = require('../src/parc/parcTagSync');

describe('parcTagSync', () => {
  it('maps expansion tag rows with channel address', () => {
    const t = parcRowToStoreTag({ id: 'X1_I3', type: 'BOOL', role: 'input', value: true }, 'opta_st_01');
    assert.equal(t.id, 'X1_I3');
    assert.equal(t.driverId, 'opta_st_01');
    assert.equal(t.driverAddress.channel, 'X1_I3');
  });

  it('corrects expansion telemetry role memory → input/output', () => {
    const xIn = parcRowToStoreTag({ id: 'X1_I1', type: 'BOOL', role: 'memory', value: false }, 'opta_st_01');
    assert.equal(xIn.role, 'input');
    const xOut = parcRowToStoreTag({ id: 'X2_R3', type: 'BOOL', role: 'memory', value: true }, 'opta_st_01');
    assert.equal(xOut.role, 'output');
    const mem = parcRowToStoreTag({ id: 'MOTOR1_RUN', type: 'BOOL', role: 'memory', value: true }, 'opta_st_01');
    assert.equal(mem.role, 'memory');
  });

  it('replaces tags on driver from Parc report', () => {
    const existing = [
      { id: 'I1', type: 'BOOL', driverId: 'opta_st_01' },
      { id: 'VPB1', type: 'BOOL', driverId: null },
    ];
    const parcTags = [
      { id: 'I1', type: 'BOOL', role: 'input', value: false },
      { id: 'X1_I1', type: 'BOOL', role: 'input', value: true },
    ];
    const r = mergeParcTagsIntoStore(existing, parcTags, 'opta_st_01');
    assert.equal(r.ok, true);
    assert.equal(r.count, 2);
    assert.equal(r.tags.filter((t) => t.driverId === 'opta_st_01').length, 2);
    assert.ok(r.tags.find((t) => t.id === 'VPB1'));
  });

  it('reassigns memory tags that share ids with Parc report', () => {
    const existing = [
      { id: 'MOTOR1_RUN', type: 'BOOL', role: 'memory', driverId: null },
      { id: 'I1', type: 'BOOL', role: 'input', driverId: 'other_drv' },
    ];
    const parcTags = [
      { id: 'MOTOR1_RUN', type: 'BOOL', role: 'memory', value: true },
      { id: 'I1', type: 'BOOL', role: 'input', value: false },
    ];
    const r = mergeParcTagsIntoStore(existing, parcTags, 'opta_st_01');
    assert.equal(r.ok, true);
    assert.equal(r.reassigned, 2);
    const motor = r.tags.find((t) => t.id === 'MOTOR1_RUN');
    assert.equal(motor.driverId, 'opta_st_01');
    assert.equal(r.tags.filter((t) => t.driverId === 'other_drv').length, 0);
  });
});
