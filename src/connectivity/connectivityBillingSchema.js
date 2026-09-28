'use strict';

const crypto = require('crypto');

const BILLING_STATUSES = new Set(['pending', 'active', 'expired', 'cancelled']);
const CONNECTIVITY_TYPES = new Set(['mqtt', 'cellular', 'hybrid']);
const RENEWAL_TYPES = new Set(['auto', 'manual', 'commission']);

function newBillingRecordId() {
  return `cbill_${crypto.randomBytes(8).toString('hex')}`;
}

function addMonths(iso, months) {
  const d = new Date(iso || Date.now());
  d.setMonth(d.getMonth() + Math.max(1, Number(months) || 12));
  return d.toISOString();
}

function normalizeBillingRecord(input, prev = null) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('billing record required'), { status: 400 });
  }
  const tenantId = String(input.tenantId ?? prev?.tenantId ?? '').trim();
  const systemId = String(input.systemId ?? prev?.systemId ?? '').trim();
  if (!tenantId || !systemId) {
    throw Object.assign(new Error('tenantId and systemId required'), { status: 400 });
  }

  const now = new Date().toISOString();
  const statusRaw = String(input.status ?? prev?.status ?? 'pending').trim().toLowerCase();
  const status = BILLING_STATUSES.has(statusRaw) ? statusRaw : 'pending';
  const connectivityRaw = String(input.connectivityType ?? prev?.connectivityType ?? 'mqtt').trim().toLowerCase();
  const connectivityType = CONNECTIVITY_TYPES.has(connectivityRaw) ? connectivityRaw : 'mqtt';
  const termMonths = Math.max(1, Number(input.termMonths ?? prev?.termMonths ?? 12));

  const commissionedAt = input.commissionedAt ?? prev?.commissionedAt ?? null;
  const renewalAt = input.renewalAt ?? prev?.renewalAt
    ?? (commissionedAt ? addMonths(commissionedAt, termMonths) : null);

  return {
    id: prev?.id || input.id || newBillingRecordId(),
    tenantId,
    systemId,
    locationId: input.locationId != null ? String(input.locationId).trim() : (prev?.locationId || null),
    deviceId: input.deviceId != null ? String(input.deviceId).trim() : (prev?.deviceId || null),
    simId: input.simId != null ? String(input.simId).trim() : (prev?.simId || null),
    iccid: input.iccid != null ? String(input.iccid).trim() : (prev?.iccid || null),
    status,
    connectivityType,
    plan: input.plan != null ? String(input.plan).trim() : (prev?.plan || 'standard'),
    termMonths,
    autoRenew: input.autoRenew !== false && (prev?.autoRenew !== false),
    commissionedAt,
    renewalAt,
    lastRenewedAt: input.lastRenewedAt ?? prev?.lastRenewedAt ?? null,
    renewalCount: Number.isFinite(Number(input.renewalCount))
      ? Number(input.renewalCount)
      : (prev?.renewalCount || 0),
    renewalHistory: Array.isArray(input.renewalHistory)
      ? input.renewalHistory
      : (prev?.renewalHistory || []),
    metadata: input.metadata && typeof input.metadata === 'object'
      ? { ...(prev?.metadata || {}), ...input.metadata }
      : (prev?.metadata || {}),
    createdAt: prev?.createdAt || input.createdAt || now,
    updatedAt: now,
  };
}

function summarizeBillingRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    tenantId: record.tenantId,
    systemId: record.systemId,
    locationId: record.locationId,
    deviceId: record.deviceId,
    simId: record.simId,
    iccid: record.iccid,
    status: record.status,
    connectivityType: record.connectivityType,
    plan: record.plan,
    termMonths: record.termMonths,
    autoRenew: record.autoRenew,
    commissionedAt: record.commissionedAt,
    renewalAt: record.renewalAt,
    lastRenewedAt: record.lastRenewedAt,
    renewalCount: record.renewalCount,
    renewalHistory: record.renewalHistory,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

module.exports = {
  BILLING_STATUSES,
  CONNECTIVITY_TYPES,
  RENEWAL_TYPES,
  newBillingRecordId,
  addMonths,
  normalizeBillingRecord,
  summarizeBillingRecord,
};
