'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  scaleRawToEng,
  scaleEngToRaw,
  evaluateAlarmLevel,
  normalizeAlarmFields,
  alarmLimitsValid,
  ALARM_LEVELS,
} = require('../src/tags/tagAnalog');

describe('tagAnalog', () => {
  it('scales raw to engineering value', () => {
    const tag = { type: 'REAL', scale: 0.1, offset: 32 };
    assert.equal(scaleRawToEng(100, tag), 42);
  });

  it('inverts engineering value to raw integer', () => {
    const tag = { type: 'INT', scale: 0.1, offset: 32 };
    assert.equal(scaleEngToRaw(42, tag), 100);
  });

  it('normalizes alarm fields', () => {
    assert.deepEqual(normalizeAlarmFields({
      alarmsEnabled: 1,
      alarmOuterLow: '10',
      alarmInnerLow: '',
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
    }), {
      alarmsEnabled: true,
      alarmOuterLow: 10,
      alarmInnerLow: null,
      alarmInnerHigh: 80,
      alarmOuterHigh: 90,
      alarmCondition: null,
    });
  });

  it('evaluates five alarm levels', () => {
    const tag = {
      type: 'REAL',
      alarmsEnabled: true,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 90,
      alarmOuterHigh: 100,
    };
    assert.ok(alarmLimitsValid(tag));
    assert.equal(evaluateAlarmLevel(tag, -1), ALARM_LEVELS.OUTER_LOW);
    assert.equal(evaluateAlarmLevel(tag, 5), ALARM_LEVELS.INNER_LOW);
    assert.equal(evaluateAlarmLevel(tag, 50), ALARM_LEVELS.NORMAL);
    assert.equal(evaluateAlarmLevel(tag, 95), ALARM_LEVELS.INNER_HIGH);
    assert.equal(evaluateAlarmLevel(tag, 101), ALARM_LEVELS.OUTER_HIGH);
  });

  it('evaluates BOOL alarm on condition', () => {
    const tag = { type: 'BOOL', alarmsEnabled: true, alarmCondition: 'on' };
    assert.equal(evaluateAlarmLevel(tag, true), 'alarm');
    assert.equal(evaluateAlarmLevel(tag, false), ALARM_LEVELS.NORMAL);
    tag.alarmCondition = 'off';
    assert.equal(evaluateAlarmLevel(tag, false), 'alarm');
    assert.equal(evaluateAlarmLevel(tag, true), ALARM_LEVELS.NORMAL);
  });

  it('returns null when alarms disabled or limits incomplete', () => {
    const tag = {
      type: 'INT',
      alarmsEnabled: false,
      alarmOuterLow: 0,
      alarmInnerLow: 10,
      alarmInnerHigh: 90,
      alarmOuterHigh: 100,
    };
    assert.equal(evaluateAlarmLevel(tag, 50), null);
    tag.alarmsEnabled = true;
    tag.alarmInnerLow = null;
    assert.equal(evaluateAlarmLevel(tag, 50), null);
  });
});
