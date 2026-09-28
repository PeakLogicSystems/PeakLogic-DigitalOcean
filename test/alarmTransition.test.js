'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { on } = require('../src/runtime/eventBus');
const { ALARM_LEVELS } = require('../src/tags/tagAnalog');

describe('alarm:transition event', () => {
  it('emits on new alarm level', () => {
    const events = [];
    const off = on('alarm:transition', (evt) => events.push(evt));
    try {
      const store = new TagStore();
      store.replaceAll([{
        id: 'EVT1',
        type: 'REAL',
        role: 'memory',
        alarmsEnabled: true,
        alarmOuterLow: 0,
        alarmInnerLow: 10,
        alarmInnerHigh: 80,
        alarmOuterHigh: 90,
        value: 50,
      }]);
      events.length = 0;
      store.setValue('EVT1', -1);
      assert.equal(events.length, 1);
      assert.equal(events[0].tagId, 'EVT1');
      assert.equal(events[0].level, ALARM_LEVELS.OUTER_LOW);
      assert.equal(events[0].previousLevel, null);
      assert.ok(events[0].since);
    } finally {
      off();
    }
  });
});
