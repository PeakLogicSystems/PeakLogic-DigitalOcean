'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const {
  ensureTpoTags,
  migrateTpoMinuteTags,
  minutesFromLegacyTimerPreset,
} = require('../src/programs/tpoTags');

describe('ensureTpoTags', () => {
  it('creates TPO1 minute parameter tags', () => {
    const store = new TagStore();
    store.replaceAll([]);
    const { added } = ensureTpoTags(store);
    assert.ok(added.includes('TPO1_ON_MIN'));
    assert.ok(added.includes('TPO1_OFF_MIN'));
    assert.ok(added.includes('TPO1_PULSE_REM'));
    assert.ok(added.includes('TPO1_24HR'));
    assert.ok(added.includes('TPO1_OFFLINE'));
    assert.equal(store.get('TPO1_ON_MIN')?.value, 30);
    assert.equal(store.get('TPO1_OFF_MIN')?.value, 120);
  });

  it('migrates legacy TIMER presets to minute params', () => {
    const store = new TagStore();
    store.replaceAll([
      {
        id: 'TPO1_TMR_ON',
        type: 'TIMER',
        role: 'memory',
        preset: 120000,
        mode: 'TON',
        value: false,
      },
      {
        id: 'TPO1_TMR_OFF',
        type: 'TIMER',
        role: 'memory',
        preset: 300000,
        mode: 'TON',
        value: false,
      },
    ]);
    const migrated = migrateTpoMinuteTags(store);
    assert.ok(migrated.includes('TPO1_ON_MIN'));
    assert.ok(migrated.includes('TPO1_OFF_MIN'));
    assert.equal(store.get('TPO1_ON_MIN')?.value, 2);
    assert.equal(store.get('TPO1_OFF_MIN')?.value, 5);
  });
});

describe('minutesFromLegacyTimerPreset', () => {
  it('converts ms preset to rounded minutes', () => {
    assert.equal(minutesFromLegacyTimerPreset({ preset: 180000 }), 3);
    assert.equal(minutesFromLegacyTimerPreset({ preset: 90000 }), 2);
    assert.equal(minutesFromLegacyTimerPreset({ preset: 0 }), null);
  });
});
