'use strict';

/** Default commissioning site key when unset (0x0001). */
const DEFAULT_GLOBAL_SITE_KEY = 0x0001;
const MIN_SITE_KEY = 0x0001;
const MAX_SITE_KEY = 0xffff;

function parseSiteKeyInput(siteKey) {
  if (typeof siteKey === 'string') {
    const s = siteKey.trim();
    if (/^0x[0-9a-fA-F]{1,4}$/.test(s)) return parseInt(s, 16);
    if (/^[0-9a-fA-F]{1,4}$/.test(s)) return parseInt(s, 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
  }
  return Number(siteKey);
}

/**
 * Normalize admin-assigned global site key (1–65535). Defaults to 0x0001 when unset.
 * @throws {Error} when out of range
 */
function normalizeSiteKey(siteKey) {
  if (siteKey == null || siteKey === '') return DEFAULT_GLOBAL_SITE_KEY;
  const n = parseSiteKeyInput(siteKey);
  if (!Number.isFinite(n)) {
    throw new Error(`globalSiteKey must be 0x0001–0xFFFF (1–65535), got ${siteKey}`);
  }
  const v = Math.floor(n);
  if (v < MIN_SITE_KEY || v > MAX_SITE_KEY) {
    throw new Error(`globalSiteKey must be 0x0001–0xFFFF (1–65535), got ${siteKey}`);
  }
  return v;
}

/** @throws {Error} when invalid */
function validateSiteKey(siteKey) {
  return normalizeSiteKey(siteKey);
}

/** Four lowercase hex digits for MQTT global addr key (Option B — direct site key, not CRC). */
function siteKeyToAddrKey(siteKey) {
  return normalizeSiteKey(siteKey).toString(16).padStart(4, '0');
}

function topicPrefix(cfg) {
  return String(cfg?.topicPrefix || 'peaklogic/v1').trim().replace(/\/+$/, '') || 'peaklogic/v1';
}

/**
 * Global P2P tag topic: peaklogic/v1/g/{siteKey4}/{tagName}
 */
function globalTopic(cfg, siteKey, tagName) {
  const tag = String(tagName || '').trim();
  if (!tag) throw new Error('tagName required');
  return `${topicPrefix(cfg)}/g/${siteKeyToAddrKey(siteKey)}/${tag}`;
}

module.exports = {
  DEFAULT_GLOBAL_SITE_KEY,
  MIN_SITE_KEY,
  MAX_SITE_KEY,
  normalizeSiteKey,
  validateSiteKey,
  siteKeyToAddrKey,
  globalTopic,
  topicPrefix,
};
