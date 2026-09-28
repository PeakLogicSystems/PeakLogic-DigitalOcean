'use strict';

const fs = require('fs');
const persistence = require('../persistence');
const { resolveTenantRelativePath } = require('../tenants/tenantPaths');

function readJsonObject(name) {
  try {
    const fp = resolveTenantRelativePath(name);
    if (fs.existsSync(fp)) {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (raw && typeof raw === 'object') return raw;
    }
  } catch {
    /* fall through */
  }
  const obj = persistence.readJson(name, {});
  return obj && typeof obj === 'object' ? obj : {};
}

function readJsonArray(name) {
  try {
    const fp = resolveTenantRelativePath(name);
    if (fs.existsSync(fp)) {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (Array.isArray(raw)) return raw;
    }
  } catch {
    /* fall through */
  }
  const list = persistence.readJson(name, []);
  return Array.isArray(list) ? list : [];
}

function listDrivers() {
  return readJsonArray('drivers.json');
}

function findDriverForTag(tag) {
  if (!tag) return null;
  const driverId = String(tag.driverId || '').trim();
  if (driverId) {
    const byId = listDrivers().find((d) => d.id === driverId);
    if (byId) return byId;
  }
  const addr = tag.driverAddress;
  if (addr && typeof addr === 'object') {
    const deviceId = String(addr.deviceId || addr.deviceInstance || '').trim();
    if (deviceId) {
      return listDrivers().find((d) => String(d.deviceId || '') === deviceId) || null;
    }
  }
  return null;
}

function resolveDeviceId(tag, driver) {
  const fromDriver = String(driver?.deviceId || '').trim();
  if (fromDriver) return fromDriver;
  const addr = tag?.driverAddress;
  if (addr && typeof addr === 'object') {
    const fromAddr = String(addr.deviceId || addr.deviceInstance || '').trim();
    if (fromAddr) return fromAddr;
  }
  return null;
}

function resolveSiteIdForDevice(tenantId, deviceId) {
  if (!deviceId) return null;
  try {
    const { tenantStore } = require('../tenants/tenantStore');
    const tid = String(tenantId || '').trim();
    if (tid) {
      const owned = tenantStore.getDevice(tid, deviceId);
      if (owned?.siteId) return String(owned.siteId).trim() || null;
    }
    const assigned = tenantStore.findAssignedDevice(deviceId);
    if (assigned?.siteId && (!tid || assigned.tenantId === tid)) {
      return String(assigned.siteId).trim() || null;
    }
  } catch {
    /* optional in appliance-only runs */
  }
  const settings = readJsonObject('settings.json');
  const fromCmms = String(settings?.cmmsIntegration?.siteId || '').trim();
  if (fromCmms) return fromCmms;
  const fromCloud = String(settings?.cloud?.gatewayId || settings?.cloud?.siteId || '').trim();
  return fromCloud || null;
}

function resolveAssetIdsForTag(tagId, tenantId) {
  const id = String(tagId || '').trim();
  if (!id) return [];
  const assetIds = [];
  const settings = readJsonObject('settings.json');
  const assetTags = settings?.pdm?.assetTags;
  if (assetTags && typeof assetTags === 'object') {
    for (const [assetId, tagIds] of Object.entries(assetTags)) {
      if (Array.isArray(tagIds) && tagIds.map(String).includes(id)) {
        assetIds.push(String(assetId));
      }
    }
  }
  const tid = String(tenantId || '').trim();
  if (tid) {
    try {
      const { tenantStore } = require('../tenants/tenantStore');
      for (const asset of tenantStore.listAssets(tid)) {
        const metaTags = asset.meta?.tagIds || asset.meta?.tags;
        if (Array.isArray(metaTags) && metaTags.map(String).includes(id)) {
          if (!assetIds.includes(asset.assetId)) assetIds.push(String(asset.assetId));
        }
      }
    } catch {
      /* optional */
    }
  }
  return assetIds;
}

function getTagById(tagId) {
  const id = String(tagId || '').trim();
  if (!id) return null;
  try {
    const { getActiveRuntime } = require('../tenants/tenantRuntime');
    const rt = getActiveRuntime();
    if (rt?.tagStore?.get) {
      const live = rt.tagStore.get(id);
      if (live) return live;
    }
  } catch {
    /* optional */
  }
  const list = readJsonArray('tags.json');
  return list.find((t) => t.id === id) || null;
}

/**
 * Resolve site/device/asset context for an alarm transition.
 * @param {{ tagId: string }} alarm
 * @param {{ tenantId?: string|null }} opts
 */
function resolveAlarmContext(alarm, opts = {}) {
  const tagId = String(alarm?.tagId || '').trim();
  const tenantId = opts.tenantId != null ? String(opts.tenantId).trim() : null;
  const tag = getTagById(tagId);
  const driver = findDriverForTag(tag);
  const deviceId = resolveDeviceId(tag, driver);
  const siteId = resolveSiteIdForDevice(tenantId, deviceId);
  const assetIds = resolveAssetIdsForTag(tagId, tenantId);
  return {
    tagId,
    driverId: tag?.driverId || driver?.id || null,
    deviceId,
    siteId,
    assetIds,
  };
}

module.exports = {
  resolveAlarmContext,
  resolveAssetIdsForTag,
  resolveSiteIdForDevice,
};
