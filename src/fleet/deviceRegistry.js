'use strict';

const persistence = require('../persistence');

const FLEET_FILE = 'fleet.json';

function defaultFleetSettings() {
  return {
    enabled: true,
    defaultReportIntervalSec: 300,
    staleAfterSec: 900,
  };
}

function emptyStore() {
  return { devices: {}, settings: defaultFleetSettings() };
}

function loadStore() {
  const raw = persistence.readJson(FLEET_FILE, null);
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    devices: raw.devices && typeof raw.devices === 'object' ? raw.devices : {},
    settings: { ...defaultFleetSettings(), ...(raw.settings || {}) },
  };
}

function saveStore(store) {
  persistence.writeJson(FLEET_FILE, store);
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
    runtime: rec.runtime || null,
    tagCount: Array.isArray(rec.tags) ? rec.tags.length : 0,
    attached: !!rec.attach?.active,
    attachHost: rec.attach?.host || null,
    pauseReports: !!rec.attach?.active,
  };
}

class DeviceRegistry {
  constructor() {
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
      driverHealth: rec.driverHealth || [],
      meta: rec.meta || {},
      attach: rec.attach || { active: false },
    };
  }

  ingestReport(body) {
    if (!this._store.settings.enabled) {
      return { ok: false, error: 'Fleet ingest disabled', status: 503 };
    }
    const deviceId = normalizeDeviceId(body.deviceId);
    const settings = this._store.settings;
    const existing = this._store.devices[deviceId] || { deviceId };
    const attach = existing.attach || { active: false };

    const rec = {
      ...existing,
      deviceId,
      name: body.name || existing.name || deviceId,
      platform: body.platform || existing.platform || '',
      reportIntervalSec: Math.max(
        30,
        Number(body.reportIntervalSec) || existing.reportIntervalSec || settings.defaultReportIntervalSec
      ),
      lastReportAt: new Date().toISOString(),
      runtime: body.runtime || null,
      tags: Array.isArray(body.tags) ? body.tags : (existing.tags || []),
      driverHealth: Array.isArray(body.driverHealth) ? body.driverHealth : (existing.driverHealth || []),
      meta: { ...(existing.meta || {}), ...(body.meta || {}) },
      attach,
    };

    this._store.devices[deviceId] = rec;
    saveStore(this._store);

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
      fleetEnabled: settings.enabled,
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
}

const registry = new DeviceRegistry();

module.exports = { DeviceRegistry, registry, defaultFleetSettings };
