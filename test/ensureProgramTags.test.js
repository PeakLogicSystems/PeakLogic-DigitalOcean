'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ensureProgramTags } = require('../src/programs/ensureProgramTags');

function mockTagStore(initial = []) {
  const tags = new Map(initial.map((t) => [t.id, { ...t }]));
  return {
    get(id) { return tags.get(id); },
    count() { return tags.size; },
    upsert(meta) { tags.set(meta.id, { ...meta }); },
    list() { return [...tags.values()]; },
  };
}

describe('ensureProgramTags', () => {
  it('adds missing refs without duplicating existing tags', () => {
    const store = mockTagStore([{ id: 'VPB1', type: 'BOOL', role: 'memory', value: false }]);
    const src = `IF IsON(MOTOR1_START) THEN TurnON(MOTOR1_RUN); END_IF;
IF IsON(VPB1) THEN SetInt(MOTOR1_STA, 1); END_IF;`;
    const first = ensureProgramTags(store, src);
    assert.ok(first.added.includes('MOTOR1_START'));
    assert.ok(first.added.includes('MOTOR1_RUN'));
    assert.ok(first.added.includes('MOTOR1_STA'));
    assert.ok(!first.added.includes('VPB1'));
    assert.equal(store.get('MOTOR1_STA')?.type, 'INT');
    assert.equal(store.get('MOTOR1_STA')?.label, 'Motor 1 status');
    const countAfter = store.count();
    const second = ensureProgramTags(store, src);
    assert.deepEqual(second.added, []);
    assert.equal(store.count(), countAfter);
  });
});
