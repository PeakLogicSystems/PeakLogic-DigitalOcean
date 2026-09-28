'use strict';

const LEGACY_DEVICE_ID_PREFIX = 'opta_';
const MV_DEVICE_ID_PREFIX = 'mv_';

/** FNV-1a 64-bit over raw bytes (matches firmware mv_identity.cpp). */
function fnv1a64Bytes(bytes) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    hash ^= BigInt(b & 0xff);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

/** Normalize ATECC608 72-bit serial to 18 lowercase hex digits. */
function normalizeAteccSerialHex(raw) {
  const hex = String(raw || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length === 18) return hex;
  if (hex.length > 18) return hex.slice(0, 18);
  if (hex.length >= 16) return hex.padStart(18, '0');
  return '';
}

function ateccSerialToBytes(serialHex) {
  const hex = normalizeAteccSerialHex(serialHex);
  if (hex.length !== 18) return null;
  const bytes = Buffer.alloc(9);
  for (let i = 0; i < 9; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function mvDeviceIdFromAteccSerial(serial) {
  const bytes = ateccSerialToBytes(serial);
  if (!bytes) {
    throw Object.assign(new Error('Invalid ATECC608 serial'), { status: 400 });
  }
  const hash = fnv1a64Bytes(bytes);
  const hex16 = hash.toString(16).padStart(16, '0');
  return `${MV_DEVICE_ID_PREFIX}${hex16}`;
}

/** Legacy Phase-0 device id: opta_{18 hex serial}. */
function legacyOptaDeviceIdFromAteccSerial(serial) {
  const hex = normalizeAteccSerialHex(serial);
  if (!hex) {
    throw Object.assign(new Error('Invalid ATECC608 serial'), { status: 400 });
  }
  return `${LEGACY_DEVICE_ID_PREFIX}${hex}`;
}

/** Primary device id (Phase 1): mv_{16hex FNV-1a64}. */
function deviceIdFromAteccSerial(serial) {
  return mvDeviceIdFromAteccSerial(serial);
}

function isMvDeviceId(deviceId) {
  return /^mv_[0-9a-f]{16}$/i.test(String(deviceId || '').trim());
}

function isLegacyOptaDeviceId(deviceId) {
  return /^opta_[0-9a-f]{16,18}$/i.test(String(deviceId || '').trim());
}

function isAteccDeviceId(deviceId) {
  return isMvDeviceId(deviceId) || isLegacyOptaDeviceId(deviceId);
}

function extractAteccSerialFromReport(body) {
  if (!body || typeof body !== 'object') return '';
  const raw = body.ateccSerial
    || body.meta?.ateccSerial
    || body.meta?.serialNumber
    || body.serialNumber;
  return normalizeAteccSerialHex(raw);
}

/**
 * Resolve mqtt_parc driver deviceId — map legacy opta_* / placeholder to mv_* when ATECC serial is known.
 */
function resolveParcDeviceId(cfg = {}) {
  const id = String(cfg.deviceId || cfg.id || '').trim();
  const serial = normalizeAteccSerialHex(cfg.ateccSerial || '');
  if (!serial) return id;
  let expectedMv = '';
  try {
    expectedMv = mvDeviceIdFromAteccSerial(serial);
  } catch {
    return id;
  }
  if (!expectedMv || id === expectedMv) return id;
  if (isLegacyOptaDeviceId(id) || id === 'opta_st_01' || !isAteccDeviceId(id)) {
    return expectedMv;
  }
  return id;
}

module.exports = {
  LEGACY_DEVICE_ID_PREFIX,
  MV_DEVICE_ID_PREFIX,
  fnv1a64Bytes,
  normalizeAteccSerialHex,
  ateccSerialToBytes,
  mvDeviceIdFromAteccSerial,
  legacyOptaDeviceIdFromAteccSerial,
  deviceIdFromAteccSerial,
  isMvDeviceId,
  isLegacyOptaDeviceId,
  isAteccDeviceId,
  isFieldParcDeviceId: isAteccDeviceId,
  extractAteccSerialFromReport,
  resolveParcDeviceId,
  /** @deprecated use LEGACY_DEVICE_ID_PREFIX */
  DEVICE_ID_PREFIX: LEGACY_DEVICE_ID_PREFIX,
};
