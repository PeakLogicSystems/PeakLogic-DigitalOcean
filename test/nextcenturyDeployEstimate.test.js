'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  estimateNextcenturyDeploy,
  estimateFromDriverInstance,
  DEFAULT_DEVICES_PER_SITE,
} = require('../src/drivers/nextcenturyDeployEstimate');

describe('nextcenturyDeployEstimate', () => {
  it('estimates 1500 devices per site at 15 min poll', () => {
    const est = estimateNextcenturyDeploy({
      type: 'nextcentury',
      pollIntervalMs: 900000,
      propertyIds: [39990],
      autoSyncTags: true,
      propertyDelayMs: 600,
    }, {
      devicesPerSite: 1500,
      scanMs: 100,
      maxTags: 4096,
    });
    assert.equal(est.siteCount, 1);
    assert.equal(est.devicesPerSite, 1500);
    assert.equal(est.totalDevices, 1500);
    assert.equal(est.tagsPerSite, 1500 * 3);
    assert.equal(est.totalTags, 4502);
    assert.equal(est.overLimit, true);
    assert.equal(est.pollIntervalMin, 15);
    assert.ok(est.scansPerPoll >= 30);
    assert.ok(est.scanLoadPct < 1);
    assert.equal(est.pollApiCalls, 1);
  });

  it('uses default 1500 devices when property list is blank', () => {
    const est = estimateNextcenturyDeploy({
      type: 'nextcentury',
      pollIntervalMs: 900000,
      autoSyncTags: true,
    });
    assert.equal(est.devicesPerSite, DEFAULT_DEVICES_PER_SITE);
    assert.equal(est.siteCount, 1);
  });

  it('scales tags and poll time across multiple sites', () => {
    const est = estimateNextcenturyDeploy({
      type: 'nextcentury',
      pollIntervalMs: 900000,
      propertyIds: [1, 2, 3],
      autoSyncTags: true,
      propertyDelayMs: 600,
    }, { devicesPerSite: 100, scanMs: 100, maxTags: 4096 });
    assert.equal(est.siteCount, 3);
    assert.equal(est.totalDevices, 300);
    assert.equal(est.tagsPerSite, 300);
    assert.equal(est.totalTags, 902);
    assert.equal(est.pollApiCalls, 3);
    assert.equal(est.pollNetworkMs, 3 * 3000 + 2 * 600);
  });

  it('uses live device count from driver instance', () => {
    const instance = {
      _deviceCache: new Map([['a', {}], ['b', {}], ['c', {}]]),
      _propertyIds: [10, 20],
    };
    const est = estimateFromDriverInstance({
      type: 'nextcentury',
      pollIntervalMs: 900000,
      autoSyncTags: true,
    }, instance, { scanMs: 100 });
    assert.equal(est.totalDevices, 3);
    assert.equal(est.siteCount, 2);
    assert.equal(est.liveData, true);
  });

  it('estimates 15 sites at 1500 devices each', () => {
    const est = estimateNextcenturyDeploy({
      type: 'nextcentury',
      pollIntervalMs: 900000,
      autoSyncTags: true,
    }, {
      devicesPerSite: 1500,
      siteCount: 15,
      maxTags: 4096,
    });
    assert.equal(est.siteCount, 15);
    assert.equal(est.totalDevices, 22500);
    assert.equal(est.totalTags, 67502);
    assert.equal(est.overLimit, true);
    assert.ok(est.recommendedMaxTags >= 67502);
  });

  it('manual tags when auto-sync is off', () => {
    const est = estimateNextcenturyDeploy({
      type: 'nextcentury',
      autoSyncTags: false,
    }, { manualTagCount: 12, maxTags: 4096 });
    assert.equal(est.totalTags, 12);
    assert.equal(est.autoSyncTags, false);
    assert.equal(est.tagSyncMs, 0);
  });
});
