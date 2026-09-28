'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TagStore } = require('../src/tags/tagStore');
const { ALARM_LEVELS } = require('../src/tags/tagAnalog');

describe('alarm annunciator', () => {
  it('tracks active alarm and ack', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'VPR1',
      type: 'REAL',
      role: 'memory',
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
      value: -1,
    }]);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'VPR1');
    assert.equal(snap.alarmLevel, ALARM_LEVELS.OUTER_LOW);
    assert.equal(snap.alarmAcked, false);
    assert.ok(snap.alarmSince);

    assert.equal(store.ackAlarm('VPR1'), true);
    const snap2 = store.liveSnapshot().find((e) => e.tagId === 'VPR1');
    assert.equal(snap2.alarmAcked, true);

    store.setValue('VPR1', 50);
    const snap3 = store.liveSnapshot().find((e) => e.tagId === 'VPR1');
    assert.equal(snap3.alarmLevel, ALARM_LEVELS.NORMAL);
    assert.equal(snap3.alarmAcked, false);
  });

  it('preserves ack while alarm stays active across severity change', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'VPR2',
      type: 'REAL',
      role: 'memory',
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
      value: 5,
    }]);
    store.ackAlarm('VPR2');
    store.setValue('VPR2', -1);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'VPR2');
    assert.equal(snap.alarmLevel, ALARM_LEVELS.OUTER_LOW);
    assert.equal(snap.alarmAcked, true);

    store.setValue('VPR2', 50);
    const cleared = store.liveSnapshot().find((e) => e.tagId === 'VPR2');
    assert.equal(cleared.alarmLevel, ALARM_LEVELS.NORMAL);
    assert.equal(cleared.alarmAcked, false);

    store.setValue('VPR2', -1);
    const reAlarm = store.liveSnapshot().find((e) => e.tagId === 'VPR2');
    assert.equal(reAlarm.alarmLevel, ALARM_LEVELS.OUTER_LOW);
    assert.equal(reAlarm.alarmAcked, false);
  });

  it('acks digital BOOL alarms while condition remains on', () => {
    const store = new TagStore();
    store.replaceAll([{
      id: 'ALF_MECH_ALM',
      type: 'BOOL',
      role: 'memory',
      alarmsEnabled: true,
      alarmCondition: 'on',
      value: true,
    }]);
    assert.equal(store.ackAllAlarms(), 1);
    const snap = store.liveSnapshot().find((e) => e.tagId === 'ALF_MECH_ALM');
    assert.equal(snap.alarmLevel, 'alarm');
    assert.equal(snap.alarmAcked, true);
    store.setValue('ALF_MECH_ALM', true);
    const snap2 = store.liveSnapshot().find((e) => e.tagId === 'ALF_MECH_ALM');
    assert.equal(snap2.alarmAcked, true);
  });
});
