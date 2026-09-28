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

/**
 * Sites, devices, and assets available on a local appliance project.
 */
function buildApplianceScopeCatalog() {
  const settings = readJsonObject('settings.json');
  const sites = [];
  const siteIds = new Set();
  const addSite = (siteId, name) => {
    const id = String(siteId || '').trim();
    if (!id || siteIds.has(id)) return;
    siteIds.add(id);
    sites.push({ siteId: id, name: String(name || id).trim() || id });
  };

  addSite(settings?.cmmsIntegration?.siteId, 'CMMS site');
  addSite(settings?.cloud?.gatewayId, settings?.cloud?.gatewayName || 'Cloud gateway');
  addSite(settings?.cloud?.siteId, 'Cloud site');

  const defaultSiteId = sites[0]?.siteId || '';
  const drivers = readJsonArray('drivers.json');
  const deviceMap = new Map();
  for (const d of drivers) {
    const deviceId = String(d.deviceId || d.id || '').trim();
    if (!deviceId) continue;
    if (deviceMap.has(deviceId)) continue;
    deviceMap.set(deviceId, {
      deviceId,
      name: String(d.name || d.label || d.id || deviceId).trim() || deviceId,
      siteId: defaultSiteId,
    });
  }

  const assetTags = settings?.pdm?.assetTags;
  const assetContext = settings?.pdm?.assetContext;
  const assetIdSet = new Set();
  if (assetTags && typeof assetTags === 'object') {
    Object.keys(assetTags).forEach((id) => assetIdSet.add(id));
  }
  if (assetContext && typeof assetContext === 'object') {
    Object.keys(assetContext).forEach((id) => assetIdSet.add(id));
  }
  const assets = [...assetIdSet].sort((a, b) => a.localeCompare(b)).map((assetId) => {
    const ctx = assetContext?.[assetId] || {};
    return {
      assetId,
      name: String(ctx.label || ctx.name || assetId).trim() || assetId,
      siteId: String(ctx.siteId || defaultSiteId).trim(),
    };
  });

  return {
    sites,
    devices: [...deviceMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    assets,
  };
}

/**
 * Sites, devices, and fleet assets for a cloud tenant.
 */
function buildTenantScopeCatalog(tenantId) {
  const { siteStore } = require('../cloud/siteStore');
  const { tenantStore } = require('../tenants/tenantStore');
  const tid = String(tenantId || '').trim();
  const sites = siteStore.listSites()
    .filter((s) => s.tenantId === tid)
    .map((s) => ({ siteId: s.siteId, name: s.name || s.siteId }));
  const devices = tenantStore.listDevices(tid)
    .map((d) => ({
      deviceId: d.deviceId,
      name: d.name || d.deviceId,
      siteId: d.siteId || '',
    }));
  const assets = tenantStore.listAssets(tid)
    .map((a) => ({
      assetId: a.assetId,
      name: a.name || a.assetId,
      siteId: a.siteId || '',
    }));
  return { tenantId: tid, sites, devices, assets };
}

module.exports = {
  buildApplianceScopeCatalog,
  buildTenantScopeCatalog,
};
