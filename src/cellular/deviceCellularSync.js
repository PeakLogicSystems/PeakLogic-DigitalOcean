'use strict';

const { registry } = require('../parc/deviceRegistry');
const gatewayCellularStore = require('./gatewayCellularStore');
const simStore = require('./simStore');
const simManager = require('./simManager');

const GATEWAY_LAN_BROKER_HOSTS = new Set(['192.168.1.1']);

function resolveSimEid(sim) {
  if (!sim) return null;
  if (sim.eid) return String(sim.eid).trim();
  const vendorSimId = String(sim.vendorSimId || '').trim();
  return /^890340/.test(vendorSimId) ? vendorSimId : null;
}

function reportUsesGatewayLanBroker(report) {
  const broker = String(report?.mqttBroker || report?.meta?.mqttBroker || '').trim();
  if (!broker) return false;
  const host = broker.split(':')[0].trim().toLowerCase();
  return GATEWAY_LAN_BROKER_HOSTS.has(host);
}

function pickGatewayCellularReport(preferredGatewayId) {
  const reports = gatewayCellularStore.listReports().filter((row) => row.iccid);
  if (!reports.length) return null;
  if (preferredGatewayId) {
    const match = reports.find((row) => row.gatewayId === preferredGatewayId);
    if (match) return match;
  }
  return reports.sort((a, b) => String(b.receivedAt || b.reportedAt || '')
    .localeCompare(String(a.receivedAt || a.reportedAt || '')))[0];
}

async function buildCellularIdentity({ gatewayReport, iccid, imsi } = {}) {
  const gw = gatewayReport || null;
  const resolvedIccid = String(iccid || gw?.iccid || '').trim() || null;
  const resolvedImsi = String(imsi || gw?.imsi || '').trim() || null;
  const sim = resolvedIccid ? await simStore.findByIccidAny(resolvedIccid) : null;
  const eid = resolveSimEid(sim);

  return {
    iccid: resolvedIccid,
    eid,
    imsi: resolvedImsi || sim?.imsi || null,
    gatewayId: gw?.gatewayId || sim?.gatewayId || null,
    modemImei: gw?.imei || null,
    signal: gw?.signal ?? null,
    platform: gw?.platform || sim?.vendor || null,
    simId: sim?.id || null,
    vendor: sim?.vendor || null,
    syncedAt: new Date().toISOString(),
  };
}

function listGatewayLanDevices(gatewayId) {
  return registry.listDevices().filter((dev) => {
    const full = registry.getDevice(dev.deviceId);
    if (!full) return false;
    if (gatewayId && full.meta?.cellular?.gatewayId && full.meta.cellular.gatewayId !== gatewayId) {
      return false;
    }
    return reportUsesGatewayLanBroker({
      mqttBroker: full.meta?.mqttBroker,
      meta: full.meta,
    });
  });
}

async function syncDeviceCellularRegistration({ deviceId, tenantId, report, gatewayId } = {}) {
  const id = String(deviceId || report?.deviceId || '').trim();
  if (!id) return { ok: false, reason: 'deviceId required' };

  const existing = registry.getDevice(id);
  const preferredGatewayId = gatewayId
    || existing?.meta?.cellular?.gatewayId
    || existing?.meta?.gatewayId
    || null;

  let gatewayReport = null;
  if (reportUsesGatewayLanBroker(report || existing?.meta || {})) {
    gatewayReport = pickGatewayCellularReport(preferredGatewayId);
  } else if (preferredGatewayId) {
    gatewayReport = pickGatewayCellularReport(preferredGatewayId);
  }

  const cellular = await buildCellularIdentity({ gatewayReport });
  if (!cellular.iccid && !cellular.eid) {
    return {
      ok: false,
      deviceId: id,
      reason: 'no cellular identity available',
      skipped: true,
    };
  }

  registry.patchDeviceMeta(id, {
    gatewayId: cellular.gatewayId || preferredGatewayId || undefined,
    cellular,
  });

  const autoLink = await simManager.autoLinkFromGateway({
    gatewayId: cellular.gatewayId,
    iccid: cellular.iccid,
    imsi: cellular.imsi,
    tenantId: tenantId || null,
    deviceId: id,
  });

  return {
    ok: true,
    deviceId: id,
    cellular,
    autoLink,
    registration: buildDeviceRegistrationPayload(id, cellular, report || existing),
  };
}

function buildDeviceRegistrationPayload(deviceId, cellular, report = {}) {
  const meta = report.meta || {};
  return {
    deviceId,
    platform: report.platform || meta.platform || '',
    registeredAt: new Date().toISOString(),
    gatewayId: cellular.gatewayId || null,
    ethIp: report.ethIp || meta.ethIp || null,
    mqttBroker: report.mqttBroker || meta.mqttBroker || null,
    cellular: {
      iccid: cellular.iccid || null,
      eid: cellular.eid || null,
      imsi: cellular.imsi || null,
      gatewayId: cellular.gatewayId || null,
      modemImei: cellular.modemImei || null,
      signal: cellular.signal ?? null,
      vendor: cellular.vendor || null,
      simId: cellular.simId || null,
      syncedAt: cellular.syncedAt || null,
    },
  };
}

async function syncGatewayLanDevices(gatewayId) {
  const devices = listGatewayLanDevices(gatewayId);
  const results = [];
  for (const dev of devices) {
    const full = registry.getDevice(dev.deviceId);
    results.push(await syncDeviceCellularRegistration({
      deviceId: dev.deviceId,
      report: full,
      gatewayId,
    }));
  }
  return { ok: true, gatewayId, count: results.length, results };
}

function cellularSummaryFromDevice(full) {
  const cellular = full?.meta?.cellular || {};
  return {
    iccid: cellular.iccid || '',
    eid: cellular.eid || '',
    imsi: cellular.imsi || '',
    gatewayId: cellular.gatewayId || full?.meta?.gatewayId || '',
    sim: cellular.iccid || '',
    modemSynced: !!(cellular.iccid && cellular.syncedAt),
  };
}

module.exports = {
  GATEWAY_LAN_BROKER_HOSTS,
  resolveSimEid,
  reportUsesGatewayLanBroker,
  pickGatewayCellularReport,
  buildCellularIdentity,
  syncDeviceCellularRegistration,
  syncGatewayLanDevices,
  buildDeviceRegistrationPayload,
  cellularSummaryFromDevice,
};
