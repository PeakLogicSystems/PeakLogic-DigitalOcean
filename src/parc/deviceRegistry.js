'use strict';

const persistence = require('../persistence');
const {
  extractAteccSerialFromReport,
  isMvDeviceId,
  legacyOptaDeviceIdFromAteccSerial,
  normalizeAteccSerialHex,
} = require('./optaSerial');
const { extractGlobalSiteKeyFromReport } = require('./commissionFence');

const PARC_FILE = 'parc.json';

function defaultParcSettings() {
  return {
    enabled: true,
    defaultReportIntervalSec: 300,
    staleAfterSec: 900,
  };
}

function emptyStore() {
  return { devices: {}, settings: defaultParcSettings() };
}

function loadStore() {
  const raw = persistence.readJson(PARC_FILE, null);
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    devices: raw.devices && typeof raw.devices === 'object' ? raw.devices : {},
    settings: { ...defaultParcSettings(), ...(raw.settings || {}) },
  };
}

function saveStore(store) {
  try {
    persistence.writeJson(PARC_FILE, store);
  } catch (e) {
    console.warn('[parc] save:', e.message || e);
  }
}

let _saveTimer = null;

/** Debounced save for high-rate MQTT telemetry (avoids Windows rename races on parc.json). */
function scheduleSaveStore(store) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      saveStore(store);
    } catch (e) {
      console.warn('[parc] save:', e.message || e);
    }
  }, 300);
}

function flushSaveStore(store) {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  saveStore(store);
}

function normalizeDeviceId(id) {
  const s = String(id || '').trim();
  if (!s) throw Object.assign(new Error('deviceId required'), { status: 400 });
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) {
    throw Object.assign(new Error('deviceId must be 1-64 chars: letters, digits, . _ -'), { status: 400 });
  }
  return s;
}

function deviceSummary(rec, settings) {
  const staleAfterSec = settings.staleAfterSec || 900;
  const ageSec = rec.lastReportAt
    ? Math.floor((Date.now() - Date.parse(rec.lastReportAt)) / 1000)
    : null;
  return {
    deviceId: rec.deviceId,
    name: rec.name || rec.deviceId,
    platform: rec.platform || '',
    reportIntervalSec: rec.reportIntervalSec || settings.defaultReportIntervalSec,
    lastReportAt: rec.lastReportAt || null,
    ageSec,
    stale: ageSec == null || ageSec > staleAfterSec,
    deviceMode: rec.meta?.deviceMode || rec.runtime?.deviceMode || 'standalone',
    runtime: rec.runtime || null,
    tagCount: Array.isArray(rec.tags) ? rec.tags.length : 0,
    expansionCount: rec.meta?.expansionCount ?? null,
    expansionModules: rec.meta?.expansionModules || [],
    attached: !!rec.attach?.active,
    attachHost: rec.attach?.host || null,
    pauseReports: !!rec.attach?.active,
    ateccSerial: rec.meta?.ateccSerial || '',
    globalSiteKey: rec.meta?.globalSiteKey ?? rec.globalSiteKey ?? null,
  };
}

class DeviceRegistry {
  constructor() {
    this._store = loadStore();
  }

  reloadFromPersistence() {
    this._store = loadStore();
  }

  settings() {
    return { ...this._store.settings };
  }

  updateSettings(patch) {
    this._store.settings = { ...this._store.settings, ...patch };
    saveStore(this._store);
    return this.settings();
  }

  listDevices() {
    const settings = this._store.settings;
    return Object.values(this._store.devices)
      .map((d) => deviceSummary(d, settings))
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  }

  getDevice(deviceId) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id];
    if (!rec) return null;
    const settings = this._store.settings;
    return {
      ...deviceSummary(rec, settings),
      tags: rec.tags || [],
      programTrace: rec.programTrace || [],
      driverHealth: rec.driverHealth || [],
      meta: rec.meta || {},
      attach: rec.attach || { active: false },
      cellular: rec.meta?.cellular || null,
      iccid: rec.meta?.cellular?.iccid || '',
      eid: rec.meta?.cellular?.eid || '',
      gatewayId: rec.meta?.cellular?.gatewayId || rec.meta?.gatewayId || '',
    };
  }

  patchDeviceMeta(deviceId, metaPatch = {}) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id];
    if (!rec) return null;
    const nextMeta = { ...(rec.meta || {}) };
    for (const [key, value] of Object.entries(metaPatch)) {
      if (key === 'cellular' && value && typeof value === 'object') {
        nextMeta.cellular = { ...(nextMeta.cellular || {}), ...value };
      } else if (value !== undefined) {
        nextMeta[key] = value;
      }
    }
    rec.meta = nextMeta;
    this._store.devices[id] = rec;
    scheduleSaveStore(this._store);
    return this.getDevice(id);
  }

  ingestReport(body) {
    if (!this._store.settings.enabled) {
      return { ok: false, error: 'Parc ingest disabled', status: 503 };
    }
    const deviceId = normalizeDeviceId(body.deviceId);
    const settings = this._store.settings;
    const existing = this._store.devices[deviceId] || { deviceId };
    const attach = existing.attach || { active: false };
    // Serial not in MQTT telemetry (redacted); keep registry/driver copy from first-seen or driver config.
    const ateccSerial = extractAteccSerialFromReport(body) || existing.meta?.ateccSerial || '';
    const globalSiteKey = extractGlobalSiteKeyFromReport(body);

    let legacyRec = null;
    let legacyKey = null;
    if (isMvDeviceId(deviceId) && ateccSerial) {
      try {
        const expectedLegacy = legacyOptaDeviceIdFromAteccSerial(ateccSerial);
        if (expectedLegacy !== deviceId && this._store.devices[expectedLegacy]) {
          legacyRec = this._store.devices[expectedLegacy];
          legacyKey = expectedLegacy;
        }
      } catch { /* invalid serial */ }
      if (!legacyRec) {
        for (const [key, rec] of Object.entries(this._store.devices)) {
          if (key === deviceId) continue;
          const otherSerial = normalizeAteccSerialHex(rec?.meta?.ateccSerial || '');
          if (otherSerial === ateccSerial && key.startsWith('opta_')) {
            legacyRec = rec;
            legacyKey = key;
            break;
          }
        }
      }
    }

    const mergedTags = Array.isArray(body.tags) && body.tags.length
      ? body.tags
      : (legacyRec?.tags?.length ? legacyRec.tags : (existing.tags || []));

    const rec = {
      ...existing,
      ...(legacyRec || {}),
      deviceId,
      name: body.name || existing.name || legacyRec?.name || deviceId,
      platform: body.platform || existing.platform || '',
      reportIntervalSec: Math.max(
        30,
        Number(body.reportIntervalSec) || existing.reportIntervalSec || settings.defaultReportIntervalSec
      ),
      lastReportAt: new Date().toISOString(),
      runtime: body.runtime || null,
      tags: mergedTags,
      programTrace: Array.isArray(body.programTrace) ? body.programTrace : (existing.programTrace || []),
      driverHealth: Array.isArray(body.driverHealth) ? body.driverHealth : (existing.driverHealth || []),
      meta: {
        ...(legacyRec?.meta || {}),
        ...(existing.meta || {}),
        ...(body.meta || {}),
        ...(body.firmwareVersion ? { firmwareVersion: String(body.firmwareVersion) } : {}),
        ...(body.protocolVersion != null ? { protocolVersion: Number(body.protocolVersion) } : {}),
        ...(ateccSerial ? { ateccSerial, serialNumber: ateccSerial } : {}),
        ...(Array.isArray(body.expansionModules)
          ? { expansionModules: body.expansionModules }
          : {}),
        ...(body.expansionCount != null ? { expansionCount: body.expansionCount } : {}),
        ...(body.ethIp ? { ethIp: String(body.ethIp), lastHost: String(body.ethIp) } : {}),
        ...(body.mqttBroker ? { mqttBroker: String(body.mqttBroker) } : {}),
        ...(body.mqttBrokerPort != null ? { mqttBrokerPort: Number(body.mqttBrokerPort) } : {}),
        ...(body.deviceMode ? { deviceMode: String(body.deviceMode) } : {}),
        ...(globalSiteKey != null ? { globalSiteKey } : {}),
        ...(body.meta?.cellular && typeof body.meta.cellular === 'object'
          ? { cellular: { ...(existing.meta?.cellular || {}), ...body.meta.cellular } }
          : {}),
      },
      attach,
    };

    this._store.devices[deviceId] = rec;
    if (Array.isArray(rec.tags) && rec.tags.length) {
      delete rec.meta.pendingTelemetry;
    }
    if (legacyKey) {
      delete this._store.devices[legacyKey];
    }
    scheduleSaveStore(this._store);

    const pauseReports = !!attach.active;
    const nextReportSec = pauseReports
      ? Math.max(rec.reportIntervalSec * 2, 600)
      : rec.reportIntervalSec;

    return {
      ok: true,
      deviceId,
      nextReportSec,
      pauseReports,
      attached: pauseReports,
      reportIntervalSec: rec.reportIntervalSec,
    };
  }

  reporterConfig(deviceId) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id];
    const settings = this._store.settings;
    const interval = rec?.reportIntervalSec || settings.defaultReportIntervalSec;
    const attached = !!rec?.attach?.active;
    return {
      deviceId: id,
      reportIntervalSec: interval,
      pauseReports: attached,
      attached,
      parcEnabled: settings.enabled,
    };
  }

  attach(deviceId, { host, port, sessionId } = {}) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id] || { deviceId: id, tags: [], driverHealth: [] };
    rec.attach = {
      active: true,
      host: host || rec.meta?.lastHost || null,
      port: port != null ? Number(port) : (rec.meta?.lastPort || 3080),
      sessionId: sessionId || null,
      at: new Date().toISOString(),
    };
    this._store.devices[id] = rec;
    saveStore(this._store);
    return this.getDevice(id);
  }

  detach(deviceId) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id];
    if (!rec) return null;
    rec.attach = { active: false };
    this._store.devices[id] = rec;
    saveStore(this._store);
    return this.getDevice(id);
  }

  /** Refresh lastReportAt when MQTT cmd proves device is live (telemetry may be throttled). */
  touchReport(deviceId) {
    const id = normalizeDeviceId(deviceId);
    const rec = this._store.devices[id];
    if (!rec) return null;
    rec.lastReportAt = new Date().toISOString();
    this._store.devices[id] = rec;
    scheduleSaveStore(this._store);
    return this.getDevice(id);
  }

  removeDevice(deviceId) {
    const id = normalizeDeviceId(deviceId);
    if (!this._store.devices[id]) return false;
    delete this._store.devices[id];
    flushSaveStore(this._store);
    return true;
  }
}

const registry = new DeviceRegistry();

function resolveRegistry() {
  // Cloud MQTT ingest writes the fleet registry. Per-tenant DeviceRegistry
  // copies created after 8/13 isolation stay empty — Live I/O must not use them.
  if (process.env.PEAKLOGIC_DEPLOYMENT === 'cloud') {
    return registry;
  }
  try {
    const active = require('../tenants/tenantRuntime').getActiveRegistry();
    if (active) return active;
  } catch {
    /* boot / tests */
  }
  return registry;
}

/** Global fleet registry (MQTT ingest on cloud SaaS). */
function getFleetRegistry() {
  return registry;
}

/** Parc list/cmd/sync: cloud uses fleet registry; appliance uses tenant or appliance registry. */
function resolveParcRegistry() {
  if (process.env.PEAKLOGIC_DEPLOYMENT === 'cloud') {
    return registry;
  }
  return resolveRegistry();
}

const registryProxy = new Proxy(registry, {
  get(_target, prop) {
    const inst = resolveRegistry();
    const val = inst[prop];
    if (typeof val === 'function') return val.bind(inst);
    return val;
  },
});

module.exports = {
  DeviceRegistry,
  registry: registryProxy,
  getFleetRegistry,
  resolveParcRegistry,
  resolveRegistry,
  defaultParcSettings,
  normalizeDeviceId,
  flushSaveStore,
};
