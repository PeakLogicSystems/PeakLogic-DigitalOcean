'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('../src/drivers/fieldbusPoll');

describe('fieldbusPoll', () => {
  it('pollIntervalMs=0 never skips', () => {
    const driver = {};
    assert.equal(shouldSkipFieldbusPoll(driver, { pollIntervalMs: 0 }), false);
  });

  it('throttles until interval elapses', () => {
    const driver = {};
    markFieldbusPolled(driver);
    assert.equal(shouldSkipFieldbusPoll(driver, { pollIntervalMs: 60000 }), true);
    driver._lastPollAt = Date.now() - 70000;
    assert.equal(shouldSkipFieldbusPoll(driver, { pollIntervalMs: 60000 }), false);
  });
});
