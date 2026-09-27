'use strict';

const simStore = require('./simStore');
const {
  readCellularSimsSettings,
  writeCellularSimsSettings,
  summarizeVendorConfig,
  normalizeVendorConfig,
  getVendorConfigById,
} = require('./cellularSettings');
const { createVendorAdapter, listVendorDefinitions, isVendorImplemented } = require('./vendors');
const { isCellularSimsEnabled } = require('./cellularSimsEnabled');
const { normalizeSimRecord } = require('./simRecordSchema');

function managerStatus() {
  const settings = readCellularSimsSettings();
  const store = simStore.status();
  return {
    enabled: isCellularSimsEnabled(),
    cellularSimsEnabled: settings.enabled,
    store,
    count: store.count,
    vendorCount: settings.vendors.length,
    configuredVendors: settings.vendors.filter((v) => v.enabled !== false).length,
    implementedVendors: listVendorDefinitions().filter((v) => v.implemented).map((v) => v.id),
  };
}

function listVendorCatalog() {
  return listVendorDefinitions();
}

function listConfiguredVendors() {
  return readCellularSimsSettings().vendors.map((v) => summarizeVendorConfig(v));
}

function addVendorConfig(input) {
  const settings = readCellularSimsSettings();
  const cfg = normalizeVendorConfig(input);
  if (settings.vendors.some((v) => v.id === cfg.id)) {
    throw Object.assign(new Error('vendor config id conflict'), { status: 409 });
  }
  settings.vendors.push(cfg);
  writeCellularSimsSettings(settings);
  return summarizeVendorConfig(cfg);
}

function updateVendorConfig(id, input) {
  const settings = readCellularSimsSettings();
  const idx = settings.vendors.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const cfg = normalizeVendorConfig({ ...settings.vendors[idx], ...input, id }, settings.vendors[idx]);
  settings.vendors[idx] = cfg;
  writeCellularSimsSettings(settings);
  return summarizeVendorConfig(cfg);
}

function removeVendorConfig(id) {
  const settings = readCellularSimsSettings();
  const next = settings.vendors.filter((v) => v.id !== id);
  if (next.length === settings.vendors.length) return false;
  settings.vendors = next;
  writeCellularSimsSettings(settings);
  return true;
}

function adapterForVendorConfig(vendorConfig, options = {}) {
  return createVendorAdapter(vendorConfig.vendorId, vendorConfig.credentials, options);
}

async function testVendorConnection(vendorConfigId, options = {}) {
  const cfg = getVendorConfigById(vendorConfigId);
  if (!cfg) throw Object.assign(new Error('Vendor config not found'), { status: 404 });
  const adapter = adapterForVendorConfig(cfg, options);
  const result = await adapter.testConnection();
  return { vendorConfigId, vendorId: cfg.vendorId, ...result };
}

async function listSims(filter = {}) {
  return simStore.list(filter);
}

async function getSim(id) {
  return simStore.get(id);
}

async function linkSim(id, patch) {
  const allowed = {};
  if (patch.deviceId != null) allowed.deviceId = patch.deviceId;
  if (patch.gatewayId != null) allowed.gatewayId = patch.gatewayId;
  if (patch.applianceId != null) allowed.applianceId = patch.applianceId;
  if (patch.tenantId != null) allowed.tenantId = patch.tenantId;
  return simStore.update(id, allowed);
}

async function syncVendor(vendorConfig, options = {}) {
  if (!isVendorImplemented(vendorConfig.vendorId)) {
    return {
      vendorConfigId: vendorConfig.id,
      vendorId: vendorConfig.vendorId,
      ok: false,
      skipped: true,
      message: `${vendorConfig.vendorId} adapter not implemented`,
      synced: 0,
    };
  }
  const adapter = adapterForVendorConfig(vendorConfig, options);
  const remoteSims = await adapter.listSims();
  const now = new Date().toISOString();
  let synced = 0;
  for (const remote of remoteSims) {
    const prev = await simStore.findByIccid(vendorConfig.vendorId, remote.iccid);
    await simStore.upsertFromVendor(normalizeSimRecord({
      ...remote,
      vendor: vendorConfig.vendorId,
      vendorConfigId: vendorConfig.id,
      tenantId: prev?.tenantId || null,
      deviceId: prev?.deviceId || null,
      gatewayId: prev?.gatewayId || null,
      applianceId: prev?.applianceId || null,
      lastSyncAt: now,
    }, prev));
    synced += 1;
  }
  return {
    vendorConfigId: vendorConfig.id,
    vendorId: vendorConfig.vendorId,
    ok: true,
    synced,
    total: remoteSims.length,
  };
}

async function syncAll(options = {}) {
  const settings = readCellularSimsSettings();
  const results = [];
  for (const vendorConfig of settings.vendors) {
    if (vendorConfig.enabled === false) continue;
    try {
      results.push(await syncVendor(vendorConfig, options));
    } catch (e) {
      results.push({
        vendorConfigId: vendorConfig.id,
        vendorId: vendorConfig.vendorId,
        ok: false,
        error: e.message || String(e),
      });
    }
  }
  const sims = await simStore.list();
  return { ok: results.every((r) => r.ok || r.skipped), results, count: sims.length, sims };
}

async function activateSim(id, options = {}) {
  const sim = await simStore.get(id);
  if (!sim) throw Object.assign(new Error('SIM not found'), { status: 404 });
  if (!sim.vendorSimId) throw Object.assign(new Error('SIM missing vendorSimId'), { status: 400 });
  const cfg = sim.vendorConfigId ? getVendorConfigById(sim.vendorConfigId) : null;
  if (!cfg) throw Object.assign(new Error('Vendor config not found for SIM'), { status: 404 });
  const adapter = adapterForVendorConfig(cfg, options);
  const result = await adapter.activateSim(sim.vendorSimId);
  const refreshed = await syncVendor(cfg, options);
  const updated = await simStore.get(id);
  return { ok: true, result, sync: refreshed, sim: updated };
}

async function deactivateSim(id, options = {}) {
  const sim = await simStore.get(id);
  if (!sim) throw Object.assign(new Error('SIM not found'), { status: 404 });
  if (!sim.vendorSimId) throw Object.assign(new Error('SIM missing vendorSimId'), { status: 400 });
  const cfg = sim.vendorConfigId ? getVendorConfigById(sim.vendorConfigId) : null;
  if (!cfg) throw Object.assign(new Error('Vendor config not found for SIM'), { status: 404 });
  const adapter = adapterForVendorConfig(cfg, options);
  const result = await adapter.deactivateSim(sim.vendorSimId);
  const refreshed = await syncVendor(cfg, options);
  const updated = await simStore.get(id);
  return { ok: true, result, sync: refreshed, sim: updated };
}

async function getSimUsage(id, options = {}) {
  const sim = await simStore.get(id);
  if (!sim) throw Object.assign(new Error('SIM not found'), { status: 404 });
  if (!sim.vendorSimId) return { dataUsageMb: sim.dataUsageMb };
  const cfg = sim.vendorConfigId ? getVendorConfigById(sim.vendorConfigId) : null;
  if (!cfg || !isVendorImplemented(cfg.vendorId)) {
    return { dataUsageMb: sim.dataUsageMb };
  }
  const adapter = adapterForVendorConfig(cfg, options);
  const usage = await adapter.getUsage(sim.vendorSimId);
  if (usage?.dataUsageMb != null) {
    await simStore.update(id, { dataUsageMb: usage.dataUsageMb });
  }
  return { ...usage, simId: id, iccid: sim.iccid };
}

module.exports = {
  managerStatus,
  listVendorCatalog,
  listConfiguredVendors,
  addVendorConfig,
  updateVendorConfig,
  removeVendorConfig,
  testVendorConnection,
  listSims,
  getSim,
  linkSim,
  syncAll,
  syncVendor,
  activateSim,
  deactivateSim,
  getSimUsage,
};
