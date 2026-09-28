'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CLOUD_NC_PLAN_SITES,
  CLOUD_NC_PLAN_DEVICES_PER_SITE,
  CLOUD_DEFAULT_MAX_TAGS,
  recommendCloudMaxTags,
} = require('../src/drivers/nextcenturyCloudSizing');

describe('nextcenturyCloudSizing', () => {
  it('recommends max tags for 15 sites × 1500 devices', () => {
    assert.equal(CLOUD_NC_PLAN_SITES, 15);
    assert.equal(CLOUD_NC_PLAN_DEVICES_PER_SITE, 1500);
    assert.equal(recommendCloudMaxTags(), 70912);
    assert.equal(CLOUD_DEFAULT_MAX_TAGS, 70912);
  });

  it('scales recommendation with site count', () => {
    const oneSite = recommendCloudMaxTags({ siteCount: 1 });
    assert.ok(oneSite < CLOUD_DEFAULT_MAX_TAGS);
    assert.equal(oneSite, 4864);
  });
});
