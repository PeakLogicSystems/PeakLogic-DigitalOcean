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
const { SimetryAdapter } = require('./vendors/simetry');
const { isCellularSimsEnabled } = require('./cellularSimsEnabled');
const { normalizeSimRecord } = require('./simRecordSchema');
const {
  normalizeBillingPeriod,
  buildBillingReport,
  billingReportToCsv,
  simHasBillingForPeriod,
} = require('./simBilling');

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

async function autoLinkFromGateway(input = {}) {
  const gatewayId = String(input.gatewayId || '').trim() || null;
  const iccid = input.iccid != null ? String(input.iccid).trim() : null;
  const imsi = input.imsi != null ? String(input.imsi).trim() : null;
  const tenantId = input.tenantId != null ? String(input.tenantId).trim() : null;
  const deviceId = input.deviceId != null ? String(input.deviceId).trim() : null;

  if (!gatewayId) {
    return { ok: false, reason: 'gatewayId required' };
  }
  if (!iccid && !imsi) {
    return { ok: false, reason: 'iccid or imsi required', gatewayId };
  }

  let sim = iccid ? await simStore.findByIccidAny(iccid) : null;
  if (!sim && imsi) {
    const sims = await simStore.list({});
    sim = sims.find((row) => String(row.imsi || '') === imsi) || null;
  }

  if (!sim) {
    return {
      ok: false,
      reason: 'sim not in inventory',
      gatewayId,
      iccid: iccid || null,
      imsi: imsi || null,
      suggestSync: true,
    };
  }

  const patch = { gatewayId };
  if (tenantId) patch.tenantId = tenantId;
  if (deviceId) patch.deviceId = deviceId;

  const alreadyLinked = sim.gatewayId === gatewayId
    && (!tenantId || sim.tenantId === tenantId)
    && (!deviceId || sim.deviceId === deviceId);
  if (alreadyLinked) {
    return {
      ok: true,
      linked: false,
      simId: sim.id,
      iccid: sim.iccid,
      gatewayId,
      message: 'already linked',
    };
  }

  const updated = await simStore.update(sim.id, patch);
  return {
    ok: true,
    linked: true,
    simId: updated?.id || sim.id,
    iccid: updated?.iccid || sim.iccid,
    gatewayId,
    tenantId: updated?.tenantId || sim.tenantId || null,
    deviceId: updated?.deviceId || sim.deviceId || null,
  };
}

async function listGatewayCellularReports() {
  const gatewayCellularStore = require('./gatewayCellularStore');
  return gatewayCellularStore.listReports();
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

function listSimetryVendorConfigs(vendorConfigId) {
  if (vendorConfigId) {
    const cfg = getVendorConfigById(vendorConfigId);
    if (!cfg || cfg.vendorId !== 'simetry') {
      throw Object.assign(new Error('Simetry vendor config not found'), { status: 404 });
    }
    return [cfg];
  }
  return readCellularSimsSettings().vendors.filter(
    (v) => v.enabled !== false && v.vendorId === 'simetry',
  );
}

function resolveSimetryEid(sim) {
  const eid = sim?.eid || sim?.vendorSimId;
  return eid && /^890340/.test(String(eid)) ? String(eid) : null;
}

async function fetchSimetryBillingPreviews(adapter, eids, period, options = {}) {
  const batchSize = Number(options.batchSize || 50);
  const previews = [];
  for (let i = 0; i < eids.length; i += batchSize) {
    const batch = eids.slice(i, i + batchSize);
    const rows = await adapter.getEsimBillingPreview({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      eids: batch,
    });
    previews.push(...rows);
  }
  return previews;
}

async function syncSimetryBilling(input = {}, options = {}) {
  const period = normalizeBillingPeriod(input.periodStart, input.periodEnd);
  const configs = listSimetryVendorConfigs(input.vendorConfigId);
  if (!configs.length) {
    throw Object.assign(new Error('No enabled Simetry vendor configuration found'), { status: 404 });
  }

  const results = [];
  for (const cfg of configs) {
    const adapter = adapterForVendorConfig(cfg, options);
    if (!(adapter instanceof SimetryAdapter)) {
      results.push({
        vendorConfigId: cfg.id,
        ok: false,
        error: 'Simetry adapter required',
      });
      continue;
    }

    let sims = await simStore.list({
      vendor: 'simetry',
      tenantId: input.tenantId || undefined,
    });
    if (input.vendorConfigId) {
      sims = sims.filter((sim) => sim.vendorConfigId === cfg.id);
    }

    const eids = sims.map(resolveSimetryEid).filter(Boolean);
    let previews = [];
    try {
      previews = await fetchSimetryBillingPreviews(adapter, eids, period, options);
    } catch (err) {
      results.push({
        vendorConfigId: cfg.id,
        vendorId: cfg.vendorId,
        ok: false,
        error: err.message || String(err),
        period,
      });
      continue;
    }

    const byEid = new Map(previews.filter((p) => p.eid).map((p) => [p.eid, p]));
    const now = new Date().toISOString();
    let updated = 0;

    for (const sim of sims) {
      const eid = resolveSimetryEid(sim);
      if (!eid) continue;
      const preview = byEid.get(eid);
      if (!preview || preview.success === false) continue;
      const primaryPlan = preview.planLines[0] || {};
      await simStore.update(sim.id, {
        dataUsageMb: preview.usageMb ?? sim.dataUsageMb,
        plan: primaryPlan.planName || sim.plan,
        metadata: {
          ...(sim.metadata || {}),
          billing: {
            vendor: 'simetry',
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            usageMb: preview.usageMb,
            usageBytes: preview.usageBytes,
            amount: preview.amount,
            serviceFee: preview.serviceFee,
            currency: preview.currency || 'USD',
            planUuid: primaryPlan.planUuid || null,
            planName: primaryPlan.planName || null,
            planRate: primaryPlan.planRate ?? null,
            planLines: preview.planLines,
            syncedAt: now,
          },
        },
      });
      updated += 1;
    }

    let invoice = null;
    try {
      invoice = await adapter.getInvoicePreview({ period: period.periodEnd });
    } catch {
      invoice = null;
    }

    results.push({
      vendorConfigId: cfg.id,
      vendorId: cfg.vendorId,
      ok: true,
      updated,
      total: sims.length,
      previewCount: previews.length,
      invoice,
      period,
    });
  }

  return {
    ok: results.every((r) => r.ok),
    vendor: 'simetry',
    period,
    results,
  };
}

async function getBillingReport(input = {}, options = {}) {
  const period = normalizeBillingPeriod(input.periodStart, input.periodEnd);
  const filter = { vendor: input.vendor || 'simetry' };
  if (input.tenantId) filter.tenantId = input.tenantId;
  let sims = await simStore.list(filter);
  if (input.vendorConfigId) {
    sims = sims.filter((sim) => sim.vendorConfigId === input.vendorConfigId);
  }

  let invoice = null;
  const live = input.live === true || input.live === '1' || input.live === 'true';
  if (live && (input.vendor || 'simetry') === 'simetry') {
    const sync = await syncSimetryBilling({
      vendorConfigId: input.vendorConfigId,
      tenantId: input.tenantId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    }, options);
    invoice = sync.results.find((r) => r.invoice)?.invoice || null;
    sims = await simStore.list(filter);
    if (input.vendorConfigId) {
      sims = sims.filter((sim) => sim.vendorConfigId === input.vendorConfigId);
    }
  } else if ((input.vendor || 'simetry') === 'simetry') {
    sims = sims.filter((sim) => simHasBillingForPeriod(sim, period));
    if (!sims.length && input.vendorConfigId) {
      try {
        const cfg = getVendorConfigById(input.vendorConfigId);
        if (cfg?.vendorId === 'simetry') {
          const adapter = adapterForVendorConfig(cfg, options);
          invoice = await adapter.getInvoicePreview({ period: period.periodEnd });
        }
      } catch {
        invoice = null;
      }
    }
  }

  return buildBillingReport(sims, period, invoice);
}

async function exportBillingCsv(input = {}, options = {}) {
  const report = await getBillingReport(input, options);
  return billingReportToCsv(report);
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
  autoLinkFromGateway,
  listGatewayCellularReports,
  syncAll,
  syncVendor,
  activateSim,
  deactivateSim,
  getSimUsage,
  syncSimetryBilling,
  getBillingReport,
  exportBillingCsv,
};
