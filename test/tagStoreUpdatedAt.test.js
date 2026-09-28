'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TagStore } = require('../src/tags/tagStore');

describe('tagStore updatedAt', () => {
  it('setValue records updatedAt and liveSnapshot exposes it', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'I1', type: 'BOOL', role: 'input', value: false }]);
    const before = Date.now();
    store.setValue('I1', true);
    const tag = store.get('I1');
    assert.ok(tag.updatedAt >= before);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'I1');
    assert.equal(snap.updatedAt, tag.updatedAt);
    assert.equal(snap.value, true);
  });

  it('applyDeviceTelemetry records updatedAt', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'AI1', type: 'REAL', role: 'input', value: 0 }]);
    const before = Date.now();
    store.applyDeviceTelemetry('AI1', { value: 12.5 }, 'GOOD');
    const tag = store.get('AI1');
    assert.ok(tag.updatedAt >= before);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'AI1');
    assert.equal(snap.updatedAt, tag.updatedAt);
    assert.equal(snap.value, 12.5);
  });

  it('does not persist updatedAt in saved tags', () => {
    const store = new TagStore();
    store.replaceAll([{ id: 'I1', type: 'BOOL', role: 'input', value: false }]);
    store.setValue('I1', true);
    const persistence = require('../src/persistence');
    const orig = persistence.writeJson;
    let saved = null;
    persistence.writeJson = (_name, data) => { saved = data; };
    try {
      store.save();
      assert.ok(Array.isArray(saved));
      assert.equal(saved[0].updatedAt, undefined);
    } finally {
      persistence.writeJson = orig;
    }
  });
});
