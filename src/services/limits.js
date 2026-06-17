'use strict';

const { LIMITS } = require('../config');

/**
 * Effective hierarchy limits for a tenant document (falls back to env defaults).
 * @param {object | null | undefined} tenant
 */
function tenantLimits(tenant) {
  return {
    locations: tenant?.maxLocations ?? LIMITS.locationsPerTenant,
    systemsPerLocation: tenant?.maxSystemsPerLocation ?? LIMITS.systemsPerLocation,
    devicesPerSystem: tenant?.maxDevicesPerSystem ?? LIMITS.devicesPerSystem,
  };
}

/**
 * @param {number} currentCount - existing document count before insert
 * @param {number} max - allowed maximum
 * @param {string} label - human-readable entity name
 */
function checkCreateLimit(currentCount, max, label) {
  if (!Number.isFinite(currentCount) || currentCount < 0) {
    return { ok: false, error: `Invalid ${label} count` };
  }
  if (currentCount >= max) {
    return { ok: false, error: `${label} limit reached (${max})` };
  }
  return { ok: true, remaining: max - currentCount - 1 };
}

module.exports = { tenantLimits, checkCreateLimit, LIMITS };
