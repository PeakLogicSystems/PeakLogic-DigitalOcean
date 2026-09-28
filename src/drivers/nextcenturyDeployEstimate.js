'use strict';

const { MAX_TAGS, DEPLOYMENT_MODE } = require('../config');
const {
  DEFAULT_POLL_MS,
  PROPERTY_DELAY_MS,
} = require('./nextcenturyConstants');
const {
  CLOUD_NC_PLAN_SITES,
  CLOUD_NC_PLAN_DEVICES_PER_SITE,
  recommendCloudMaxTags,
} = require('./nextcenturyCloudSizing');

/** Planning default: large assisted-living / multi-family site. */
const DEFAULT_DEVICES_PER_SITE = 1500;
/** Conservative auto-sync: USAGE + TEMP + LEAK per device. */
const DEFAULT_TAGS_PER_DEVICE = 3;
const STATUS_TAG_COUNT = 2;
/** Per-property RunReport round-trip (large row sets). */
const DEFAULT_API_LATENCY_MS = 3000;
/** Tag store replace + driver apply during poll (ms per tag). */
const TAG_SYNC_MS_PER_TAG = 0.05;

function resolveSiteCount(cfg, opts = {}) {
  if (Number.isFinite(opts.siteCount) && opts.siteCount > 0) {
    return Math.trunc(opts.siteCount);
  }
  const ids = Array.isArray(cfg?.propertyIds) ? cfg.propertyIds : [];
  if (ids.length) return ids.length;
  if (Number.isFinite(opts.knownSiteCount) && opts.knownSiteCount > 0) {
    return Math.trunc(opts.knownSiteCount);
  }
  if (opts.cloudPlan !== false && DEPLOYMENT_MODE === 'cloud') {
    return CLOUD_NC_PLAN_SITES;
  }
  return 1;
}

function resolveDevicesPerSite(cfg, opts = {}, siteCount) {
  if (Number.isFinite(opts.knownDeviceCount) && opts.knownDeviceCount > 0) {
    const total = Math.trunc(opts.knownDeviceCount);
    return Math.max(1, Math.ceil(total / Math.max(1, siteCount)));
  }
  const n = Number(opts.devicesPerSite ?? cfg?.devicesPerSite);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  if (opts.cloudPlan !== false && DEPLOYMENT_MODE === 'cloud') {
    return CLOUD_NC_PLAN_DEVICES_PER_SITE;
  }
  return DEFAULT_DEVICES_PER_SITE;
}

/**
 * Estimate PeakLogic deployment load for a NextCentury driver (per site / property).
 * @param {object} cfg - nextcentury driver config
 * @param {object} [opts]
 * @param {number} [opts.scanMs] - runtime scan interval (default 100)
 * @param {number} [opts.maxTags] - tag cap (default MAX_TAGS)
 * @param {number} [opts.devicesPerSite] - planning devices per property (default 1500)
 * @param {number} [opts.siteCount] - override property count
 * @param {number} [opts.knownDeviceCount] - live device count from last poll
 * @param {number} [opts.knownSiteCount] - live property count from driver
 * @param {number} [opts.tagsPerDevice] - auto-sync tags per device (default 3)
 * @param {number} [opts.apiLatencyMs] - per-property API latency estimate
 */
function estimateNextcenturyDeploy(cfg, opts = {}) {
  const pollIntervalMs = Number(cfg?.pollIntervalMs) > 0
    ? Number(cfg.pollIntervalMs)
    : DEFAULT_POLL_MS;
  const propertyDelayMs = Number(cfg?.propertyDelayMs) > 0
    ? Number(cfg.propertyDelayMs)
    : PROPERTY_DELAY_MS;
  const autoSyncTags = cfg?.autoSyncTags !== false;
  const scanMs = Number(opts.scanMs) > 0 ? Number(opts.scanMs) : 100;
  const maxTags = Number(opts.maxTags) > 0 ? Number(opts.maxTags) : MAX_TAGS;
  const tagsPerDevice = Number(opts.tagsPerDevice) > 0
    ? Number(opts.tagsPerDevice)
    : DEFAULT_TAGS_PER_DEVICE;
  const apiLatencyMs = Number(opts.apiLatencyMs) > 0
    ? Number(opts.apiLatencyMs)
    : DEFAULT_API_LATENCY_MS;

  const siteCount = resolveSiteCount(cfg, opts);
  const devicesPerSite = resolveDevicesPerSite(cfg, opts, siteCount);
  const totalDevices = Number.isFinite(opts.knownDeviceCount) && opts.knownDeviceCount > 0
    ? Math.trunc(opts.knownDeviceCount)
    : devicesPerSite * siteCount;

  const deviceTagsTotal = autoSyncTags
    ? Math.trunc(devicesPerSite * tagsPerDevice) * siteCount
    : Math.max(0, Number(opts.manualTagCount) || 0);
  const tagsPerSite = autoSyncTags
    ? Math.trunc(devicesPerSite * tagsPerDevice)
    : deviceTagsTotal;
  const totalTags = autoSyncTags
    ? deviceTagsTotal + STATUS_TAG_COUNT
    : deviceTagsTotal;

  const pollApiCalls = siteCount;
  const pollNetworkMs = pollApiCalls * apiLatencyMs
    + Math.max(0, pollApiCalls - 1) * propertyDelayMs;
  const tagSyncMs = autoSyncTags ? Math.round(totalTags * TAG_SYNC_MS_PER_TAG) : 0;
  const pollDurationMs = pollNetworkMs + tagSyncMs;

  const scansPerPoll = Math.max(1, Math.ceil(pollDurationMs / scanMs));
  const scanLoadPct = pollIntervalMs > 0
    ? Math.round((pollDurationMs / pollIntervalMs) * 10000) / 100
    : 100;
  const pollsPerHour = pollIntervalMs > 0
    ? Math.round((3600000 / pollIntervalMs) * 10) / 10
    : 0;
  const headroom = maxTags - totalTags;
  const pct = maxTags > 0 ? Math.min(100, Math.round((totalTags / maxTags) * 100)) : 0;
  const recommendedMaxTags = totalTags > 0
    ? Math.ceil(totalTags * 1.05 / 256) * 256
    : (DEPLOYMENT_MODE === 'cloud' ? recommendCloudMaxTags({ siteCount, devicesPerSite }) : maxTags);

  return {
    ok: true,
    driverType: 'nextcentury',
    deploymentMode: DEPLOYMENT_MODE,
    cloudSizing: DEPLOYMENT_MODE === 'cloud',
    siteCount,
    devicesPerSite,
    totalDevices,
    tagsPerSite,
    totalTags,
    tagCount: totalTags,
    tagsPerDevice,
    statusTagCount: STATUS_TAG_COUNT,
    maxTags,
    overLimit: totalTags > maxTags,
    headroom,
    pct,
    recommendedMaxTags,
    autoSyncTags,
    pollIntervalMs,
    pollIntervalMin: Math.round((pollIntervalMs / 60000) * 10) / 10,
    propertyDelayMs,
    pollApiCalls,
    pollDurationMs,
    pollDurationSec: Math.round(pollDurationMs / 100) / 10,
    pollNetworkMs,
    tagSyncMs,
    scansPerPoll,
    scanLoadPct,
    pollsPerHour,
    scanMs,
    liveData: !!(opts.knownDeviceCount || opts.knownSiteCount),
  };
}

/** Pull live counts from a connected NextcenturyDriver instance when available. */
function estimateFromDriverInstance(cfg, instance, opts = {}) {
  const live = {};
  if (instance) {
    const deviceCount = instance._deviceCache?.size;
    if (Number.isFinite(deviceCount) && deviceCount > 0) {
      live.knownDeviceCount = deviceCount;
    }
    const siteCount = instance._propertyIds?.length;
    if (Number.isFinite(siteCount) && siteCount > 0) {
      live.knownSiteCount = siteCount;
    }
  }
  return estimateNextcenturyDeploy(cfg, { ...opts, ...live });
}

module.exports = {
  DEFAULT_DEVICES_PER_SITE,
  DEFAULT_TAGS_PER_DEVICE,
  DEFAULT_API_LATENCY_MS,
  estimateNextcenturyDeploy,
  estimateFromDriverInstance,
};
