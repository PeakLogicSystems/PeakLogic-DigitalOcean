'use strict';

const crypto = require('crypto');
const persistence = require('../persistence');
const { listVendorDefinitions } = require('./vendors');

const SECRET_KEYS = new Set(['apiKey', 'authToken', 'apiSecret', 'clientSecret', 'password']);

function newVendorConfigId() {
  return `cv_${crypto.randomBytes(6).toString('hex')}`;
}

function defaultCellularSimsSettings(prev = {}) {
  return {
    enabled: prev.enabled === true,
    vendors: Array.isArray(prev.vendors) ? prev.vendors.map((v) => ({ ...v })) : [],
  };
}

function isMaskedSecret(value) {
  const s = String(value ?? '').trim();
  return !s || /^•+$/.test(s) || s === '********';
}

function normalizeVendorCredentials(vendorId, input = {}) {
  const def = listVendorDefinitions().find((v) => v.id === vendorId);
  if (!def) throw Object.assign(new Error(`unknown vendor: ${vendorId}`), { status: 400 });
  const creds = {};
  for (const field of def.configSchema) {
    if (input[field.key] == null) continue;
    const val = String(input[field.key]).trim();
    if (field.secret && isMaskedSecret(val)) continue;
    creds[field.key] = val;
  }
  return creds;
}

function normalizeVendorConfig(input, prev = null) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('vendor config required'), { status: 400 });
  }
  const vendorId = String(input.vendorId ?? prev?.vendorId ?? '').trim().toLowerCase();
  const def = listVendorDefinitions().find((v) => v.id === vendorId);
  if (!def) throw Object.assign(new Error(`unknown vendor: ${vendorId}`), { status: 400 });

  const label = String(input.label ?? prev?.label ?? def.displayName).trim().slice(0, 128);
  const credentials = {
    ...(prev?.credentials || {}),
    ...normalizeVendorCredentials(vendorId, input.credentials || {}),
  };

  for (const field of def.configSchema) {
    if (field.required && !credentials[field.key]) {
      throw Object.assign(new Error(`${field.key} required for ${def.displayName}`), { status: 400 });
    }
  }

  return {
    id: prev?.id || input.id || newVendorConfigId(),
    vendorId,
    label,
    enabled: input.enabled !== false,
    credentials,
    createdAt: prev?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCellularSimsSettings(input, prev = {}) {
  const base = defaultCellularSimsSettings(prev);
  if (input === null) return { enabled: false, vendors: [] };
  if (input === undefined) return base;
  if (typeof input !== 'object') return base;

  const vendors = Array.isArray(input.vendors)
    ? input.vendors.map((v, i) => normalizeVendorConfig(v, base.vendors[i] || null))
    : base.vendors;

  return {
    enabled: input.enabled === true || base.enabled,
    vendors,
  };
}

function readCellularSimsSettings() {
  const settings = persistence.readJson('settings.json', {});
  return normalizeCellularSimsSettings(settings.cellularSims, settings.cellularSims || {});
}

function writeCellularSimsSettings(next) {
  const settings = persistence.readJson('settings.json', {});
  settings.cellularSims = normalizeCellularSimsSettings(next, settings.cellularSims || {});
  persistence.writeJson('settings.json', settings);
  return settings.cellularSims;
}

function maskCredentials(credentials = {}) {
  const out = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!value) {
      out[key] = '';
      continue;
    }
    out[key] = SECRET_KEYS.has(key) ? '••••••••' : value;
  }
  return out;
}

function summarizeVendorConfig(cfg) {
  const def = listVendorDefinitions().find((v) => v.id === cfg.vendorId);
  return {
    id: cfg.id,
    vendorId: cfg.vendorId,
    displayName: def?.displayName || cfg.vendorId,
    label: cfg.label,
    enabled: cfg.enabled !== false,
    implemented: def?.implemented === true,
    stub: def?.stub === true,
    docsUrl: def?.docsUrl || null,
    configSchema: def?.configSchema || [],
    credentials: maskCredentials(cfg.credentials),
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

function getVendorConfigById(id) {
  const cfg = readCellularSimsSettings().vendors.find((v) => v.id === id);
  return cfg || null;
}

module.exports = {
  SECRET_KEYS,
  defaultCellularSimsSettings,
  normalizeCellularSimsSettings,
  normalizeVendorConfig,
  normalizeVendorCredentials,
  readCellularSimsSettings,
  writeCellularSimsSettings,
  maskCredentials,
  summarizeVendorConfig,
  getVendorConfigById,
};
