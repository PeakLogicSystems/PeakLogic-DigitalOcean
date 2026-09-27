'use strict';

const crypto = require('crypto');

const SIM_STATUSES = new Set([
  'active',
  'inactive',
  'paused',
  'suspended',
  'pending',
  'deactivated',
  'unknown',
]);

function normalizeIccid(value) {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

function simRecordId(vendor, iccid) {
  const key = `${String(vendor || '').trim().toLowerCase()}:${normalizeIccid(iccid)}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `csim_${hash}`;
}

function normalizeStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (SIM_STATUSES.has(s)) return s;
  if (/live|active|ready|enabled|online/.test(s)) return 'active';
  if (/pause|paused/.test(s)) return 'paused';
  if (/suspend|suspended|blocked/.test(s)) return 'suspended';
  if (/inactive|new|disabled|offline/.test(s)) return 'inactive';
  if (/deactiv|dead|terminated|closed/.test(s)) return 'deactivated';
  if (/pending|activating|test/.test(s)) return 'pending';
  return 'unknown';
}

function normalizeSimRecord(input, prev = null) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('sim record required'), { status: 400 });
  }
  const vendor = String(input.vendor ?? prev?.vendor ?? '').trim().toLowerCase();
  const iccid = normalizeIccid(input.iccid ?? prev?.iccid);
  if (!vendor) throw Object.assign(new Error('vendor required'), { status: 400 });
  if (!iccid) throw Object.assign(new Error('iccid required'), { status: 400 });

  const dataUsageMb = input.dataUsageMb ?? prev?.dataUsageMb;
  const now = new Date().toISOString();

  return {
    id: prev?.id || input.id || simRecordId(vendor, iccid),
    iccid,
    imsi: input.imsi != null ? String(input.imsi).trim() : (prev?.imsi || null),
    eid: input.eid != null ? String(input.eid).trim() : (prev?.eid || null),
    msisdn: input.msisdn != null ? String(input.msisdn).trim() : (prev?.msisdn || null),
    vendor,
    vendorSimId: String(input.vendorSimId ?? prev?.vendorSimId ?? '').trim() || null,
    vendorDeviceId: input.vendorDeviceId != null
      ? String(input.vendorDeviceId).trim()
      : (prev?.vendorDeviceId || null),
    status: normalizeStatus(input.status ?? prev?.status),
    dataUsageMb: Number.isFinite(Number(dataUsageMb)) ? Number(dataUsageMb) : (prev?.dataUsageMb ?? null),
    plan: input.plan != null ? String(input.plan).trim() : (prev?.plan || null),
    deviceId: input.deviceId != null ? String(input.deviceId).trim() : (prev?.deviceId || null),
    gatewayId: input.gatewayId != null ? String(input.gatewayId).trim() : (prev?.gatewayId || null),
    applianceId: input.applianceId != null ? String(input.applianceId).trim() : (prev?.applianceId || null),
    tenantId: input.tenantId != null ? String(input.tenantId).trim() : (prev?.tenantId || null),
    vendorConfigId: input.vendorConfigId != null
      ? String(input.vendorConfigId).trim()
      : (prev?.vendorConfigId || null),
    lastSyncAt: input.lastSyncAt || prev?.lastSyncAt || now,
    createdAt: prev?.createdAt || input.createdAt || now,
    updatedAt: now,
    metadata: input.metadata && typeof input.metadata === 'object'
      ? { ...(prev?.metadata || {}), ...input.metadata }
      : (prev?.metadata || {}),
  };
}

function summarizeSim(sim) {
  if (!sim) return null;
  return {
    id: sim.id,
    iccid: sim.iccid,
    imsi: sim.imsi,
    eid: sim.eid,
    msisdn: sim.msisdn,
    vendor: sim.vendor,
    vendorSimId: sim.vendorSimId,
    vendorDeviceId: sim.vendorDeviceId,
    status: sim.status,
    dataUsageMb: sim.dataUsageMb,
    plan: sim.plan,
    deviceId: sim.deviceId,
    gatewayId: sim.gatewayId,
    applianceId: sim.applianceId,
    tenantId: sim.tenantId,
    vendorConfigId: sim.vendorConfigId,
    lastSyncAt: sim.lastSyncAt,
    createdAt: sim.createdAt,
    updatedAt: sim.updatedAt,
    metadata: sim.metadata,
  };
}

module.exports = {
  SIM_STATUSES,
  simRecordId,
  normalizeIccid,
  normalizeStatus,
  normalizeSimRecord,
  summarizeSim,
};
