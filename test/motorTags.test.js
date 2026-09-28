'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { ensureMotorTags } = require('../src/programs/motorTags');

describe('ensureMotorTags', () => {
  it('migrates legacy CTR alias to MOTOR1_CNTR', () => {
    const store = new TagStore();
    store.replaceAll([
      { id: 'CTR', label: 'Motor 1 start counter', type: 'COUNTER', role: 'memory', preset: 999999, mode: 'CTU', value: 0 },
      { id: 'MOTOR1_RUN', type: 'BOOL', role: 'memory', value: false },
    ]);
    assert.ok(store.get('CTR'));
    assert.equal(store.get('MOTOR1_CNTR'), null);

    ensureMotorTags(store);

    assert.equal(store.get('CTR'), null);
    assert.equal(store.get('MOTOR1_CNTR')?.id, 'MOTOR1_CNTR');
    assert.equal(store.get('MOTOR1_CNTR')?.type, 'COUNTER');
  });

  it('creates MOTOR1_CNTR without renaming to CTR', () => {
    const store = new TagStore();
    store.replaceAll([]);
    const { added } = ensureMotorTags(store);
    assert.ok(added.includes('MOTOR1_CNTR'));
    assert.equal(store.get('MOTOR1_CNTR')?.id, 'MOTOR1_CNTR');
    assert.equal(store.get('CTR'), null);
  });
});
