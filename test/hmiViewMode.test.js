'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HMI_POLL_MS_NORMAL,
  HMI_POLL_MS_TEST,
  canEnableHmiTestMode,
  normalizeHmiTestMode,
  hmiPollMsFromSettings,
} = require('../src/hmi/hmiViewMode');

describe('hmiViewMode', () => {
  it('uses 60s poll for normal operator view', () => {
    assert.equal(hmiPollMsFromSettings({ userLevel: 'operator', hmi: {} }), HMI_POLL_MS_NORMAL);
    assert.equal(HMI_POLL_MS_NORMAL, 60_000);
  });

  it('uses 10s poll when technician test mode is on', () => {
    const settings = { userLevel: 'technician', hmi: { testMode: true } };
    assert.equal(hmiPollMsFromSettings(settings), HMI_POLL_MS_TEST);
    assert.equal(HMI_POLL_MS_TEST, 10_000);
  });

  it('allows demo projects to enable test mode toggle', () => {
    const settings = {
      userLevel: 'operator',
      demoFeatures: { hmiTestMode: true },
      hmi: { testMode: true },
    };
    assert.equal(canEnableHmiTestMode(settings), true);
    assert.equal(normalizeHmiTestMode(true, settings), true);
    assert.equal(hmiPollMsFromSettings(settings), HMI_POLL_MS_TEST);
  });

  it('ignores test mode for operators without demo flag', () => {
    const settings = { userLevel: 'operator', hmi: { testMode: true } };
    assert.equal(canEnableHmiTestMode(settings), false);
    assert.equal(normalizeHmiTestMode(true, settings), false);
    assert.equal(hmiPollMsFromSettings(settings), HMI_POLL_MS_NORMAL);
  });
});
