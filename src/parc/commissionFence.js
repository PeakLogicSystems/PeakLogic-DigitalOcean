'use strict';

const {
  DEFAULT_GLOBAL_SITE_KEY,
  MIN_SITE_KEY,
  MAX_SITE_KEY,
  normalizeSiteKey,
} = require('./globalAddressKey');

/** Fence is mqttParc / Opta globalSiteKey (16-bit). 6-digit decimal is display/entry only. */

function formatSiteKeyHex(key) {
  try {
    return `0x${normalizeSiteKey(key).toString(16).padStart(4, '0')}`;
  } catch {
    return null;
  }
}

/** 0x0001 → "000001" — convenience for field entry, not a separate code. */
function formatSiteKeyDigits(key) {
  try {
    return String(normalizeSiteKey(key)).padStart(6, '0');
  } catch {
    return null;
  }
}

/**
 * Parse a site key without defaulting empty → 0x0001.
 * Accepts 0x0001, 1, 000001. Returns null when unset/invalid.
 */
function tryParseSiteKey(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const v = Math.floor(raw);
    if (v >= MIN_SITE_KEY && v <= MAX_SITE_KEY) return v;
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{6}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= MIN_SITE_KEY && n <= MAX_SITE_KEY) return n;
    return null;
  }
  try {
    return normalizeSiteKey(s);
  } catch {
    return null;
  }
}

function extractGlobalSiteKeyFromReport(body = {}) {
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const candidates = [
    body.globalSiteKey,
    body.siteKey,
    meta.globalSiteKey,
    meta.siteKey,
    body.commissionCode,
    meta.commissionCode,
  ];
  for (const raw of candidates) {
    const key = tryParseSiteKey(raw);
    if (key != null) return key;
  }
  return null;
}

function deviceGlobalSiteKey(device) {
  if (!device) return null;
  return tryParseSiteKey(
    device.globalSiteKey
    ?? device.meta?.globalSiteKey
    ?? device.meta?.siteKey
    ?? device.commissionCode
    ?? device.meta?.commissionCode,
  );
}

function visibleKeysForTenant(tenant) {
  const keys = new Set();
  const own = tryParseSiteKey(tenant?.globalSiteKey);
  if (own != null) keys.add(own);
  return keys;
}

function deviceMatchesFence(device, allowedKeys) {
  const key = deviceGlobalSiteKey(device);
  if (key == null) return false;
  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys || []);
  return allowed.has(key);
}

/**
 * Whether this Opta may appear on a tenant website.
 * Unfenced (no key yet) stays visible on the assigned org; a set key must match.
 */
function deviceAllowedOnTenant(device, tenant) {
  const key = deviceGlobalSiteKey(device);
  if (key == null) return true;
  return deviceMatchesFence(device, visibleKeysForTenant(tenant));
}

function allocatedSiteKeys(tenants = []) {
  const taken = new Set();
  for (const t of tenants) {
    const key = tryParseSiteKey(t?.globalSiteKey);
    if (key != null) taken.add(key);
  }
  return taken;
}

function allocateUniqueSiteKey(existing = new Set()) {
  const taken = existing instanceof Set ? existing : new Set(existing || []);
  for (let k = MIN_SITE_KEY; k <= MAX_SITE_KEY; k += 1) {
    if (!taken.has(k)) return k;
  }
  throw Object.assign(new Error('No free global site key remaining (0x0001–0xFFFF)'), { status: 500 });
}

function publicSiteKeyFields(key) {
  const n = tryParseSiteKey(key);
  if (n == null) return { globalSiteKey: null, globalSiteKeyHex: null, globalSiteKeyDigits: null };
  return {
    globalSiteKey: n,
    globalSiteKeyHex: formatSiteKeyHex(n),
    globalSiteKeyDigits: formatSiteKeyDigits(n),
  };
}

module.exports = {
  DEFAULT_GLOBAL_SITE_KEY,
  formatSiteKeyHex,
  formatSiteKeyDigits,
  tryParseSiteKey,
  extractGlobalSiteKeyFromReport,
  deviceGlobalSiteKey,
  visibleKeysForTenant,
  deviceMatchesFence,
  deviceAllowedOnTenant,
  allocatedSiteKeys,
  allocateUniqueSiteKey,
  publicSiteKeyFields,
};
