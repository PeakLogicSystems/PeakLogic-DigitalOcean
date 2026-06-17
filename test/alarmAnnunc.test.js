'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { ALARM_LEVELS } = require('../src/tags/tagAnalog');

describe('alarm annunciator', () => {
  it('tracks active alarm and ack', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'AI1',
      type: 'REAL',
      role: 'memory',
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
      value: 5,
    }]);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'AI1');
    assert.equal(snap.alarmLevel, ALARM_LEVELS.OUTER_LOW);
    assert.equal(snap.alarmAcked, false);
    assert.ok(snap.alarmSince);

    assert.equal(store.ackAlarm('AI1'), true);
    const snap2 = store.liveSnapshot().find((e) => e.tagId === 'AI1');
    assert.equal(snap2.alarmAcked, true);

    store.setValue('AI1', 50);
    const snap3 = store.liveSnapshot().find((e) => e.tagId === 'AI1');
    assert.equal(snap3.alarmLevel, ALARM_LEVELS.NORMAL);
    assert.equal(snap3.alarmAcked, false);
  });

  it('re-alarm on severity change clears ack', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'AI2',
      type: 'REAL',
      role: 'memory',
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
      value: 15,
    }]);
    store.ackAlarm('AI2');
    store.setValue('AI2', 5);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'AI2');
    assert.equal(snap.alarmLevel, ALARM_LEVELS.OUTER_LOW);
    assert.equal(snap.alarmAcked, false);
  });
});
