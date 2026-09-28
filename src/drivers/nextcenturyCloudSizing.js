'use strict';

/** Cloud NextCentury planning defaults (15 properties × 1500 devices). */
const CLOUD_NC_PLAN_SITES = 15;
const CLOUD_NC_PLAN_DEVICES_PER_SITE = 1500;
const CLOUD_NC_TAGS_PER_DEVICE = 3;
const CLOUD_NC_STATUS_TAGS = 2;

/**
 * Recommended PEAKLOGIC_MAX_TAGS for cloud hub with full NC auto-sync.
 * 15 sites × 1500 devices × 3 tags/device + 2 status tags, plus 5% headroom, rounded to 256.
 */
function recommendCloudMaxTags(opts = {}) {
  const siteCount = Number(opts.siteCount) > 0
    ? Math.trunc(opts.siteCount)
    : CLOUD_NC_PLAN_SITES;
  const devicesPerSite = Number(opts.devicesPerSite) > 0
    ? Math.trunc(opts.devicesPerSite)
    : CLOUD_NC_PLAN_DEVICES_PER_SITE;
  const tagsPerDevice = Number(opts.tagsPerDevice) > 0
    ? Number(opts.tagsPerDevice)
    : CLOUD_NC_TAGS_PER_DEVICE;
  const totalTags = siteCount * devicesPerSite * tagsPerDevice + CLOUD_NC_STATUS_TAGS;
  return Math.ceil((totalTags * 1.05) / 256) * 256;
}

const CLOUD_DEFAULT_MAX_TAGS = recommendCloudMaxTags();

module.exports = {
  CLOUD_NC_PLAN_SITES,
  CLOUD_NC_PLAN_DEVICES_PER_SITE,
  CLOUD_NC_TAGS_PER_DEVICE,
  CLOUD_DEFAULT_MAX_TAGS,
  recommendCloudMaxTags,
};
