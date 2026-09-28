'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { QUALITY } = require('../tags/constants');
const { mergeNextcenturyTagsIntoStore } = require('./nextcenturyTagSync');
const {
  DEFAULT_POLL_MS,
  PROPERTY_DELAY_MS,
  DEFAULT_REPORT_ID,
} = require('./nextcenturyConstants');
const {
  resolveCredentials,
  loginNextcentury,
  TOKEN_TTL_MS,
} = require('./nextcenturyAuth');

const BASE_API_URL = 'https://api.nextcenturymeters.com/api';
const NUMERIC_FIELDS = new Set([
  'temperature',
  'currentReading',
  'previousReading',
  'totalUsage',
  'propertyId',
]);

function reportDateStr(d = new Date()) {
  return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
}

/** Folder where test-execute report dumps are written. */
const REPORT_DUMP_DIR = path.join(DATA_DIR, 'nextcentury-reports');

/** Filesystem-safe local timestamp: YYYY-MM-DD_HH-mm-ss. */
function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRt4510Row(row, propertyId) {
  return {
    propertyId,
    installationType: row[0] || null,
    leakStatus: row[1] || null,
    unknown1: row[2] || null,
    area: row[3] || null,
    unknown2: row[4] || null,
    deviceType: row[5] || null,
    temperature: row[6] != null && row[6] !== '' ? Number(row[6]) : null,
    deviceId: (row[7] != null ? String(row[7]).trim() : '') || null,
    meterModel: row[8] || null,
    currentReading: row[9] != null && row[9] !== '' ? Number(row[9]) : null,
    previousReading: row[10] != null && row[10] !== '' ? Number(row[10]) : null,
    totalUsage: row[11] != null && row[11] !== '' ? Number(row[11]) : null,
    unitNumber: row[12] || null,
    description: row[13] || null,
  };
}

function leakIsActive(leakStatus) {
  const s = String(leakStatus || '').trim().toLowerCase();
  if (!s) return false;
  // Non-leak / monitoring-disabled states must not be read as an active leak,
  // even though the text contains the word "leak"
  // (e.g. "Leak Monitoring Not Enabled").
  if (
    s.includes('no leak')
    || s.includes('not enabled')
    || s.includes('disabled')
    || s.includes('not monitor')
    || s === 'dry'
    || s === 'ok'
  ) return false;
  return s.includes('leak') || s.includes('wet');
}

/** NC rt_4510 walk-in freezer probes encode col-6 as (probe °F + 27.2). */
const FREEZER_PROBE_TEMP_OFFSET_F = 27.2;

function isFreezerProbeDoc(doc) {
  const dt = String(doc?.deviceType || '').toLowerCase();
  if (!dt.includes('transceiver')) return false;
  const desc = String(doc.description || doc.area || '').toLowerCase();
  return desc.includes('freezer');
}

function freezerProbeTempF(doc) {
  if (!doc) return null;
  const cur = doc.currentReading;
  if (cur != null && Number.isFinite(Number(cur))) {
    const n = Number(cur);
    // Live polls often carry probe °F in currentReading (e.g. -22.2).
    if (n !== 0 && n < 15) return n;
  }
  const raw = doc.temperature;
  if (raw == null || Number.isNaN(Number(raw))) return null;
  const r = Number(raw);
  // Encoded col-6 value (e.g. 5 → -22.2 °F).
  if (r <= 20) return r - FREEZER_PROBE_TEMP_OFFSET_F;
  return r;
}

function fieldValue(doc, field) {
  if (!doc || !field) return null;
  if (field === 'leakActive') return leakIsActive(doc.leakStatus);
  if (field === '_deviceCount') return doc._deviceCount ?? null;
  if (field === '_lastCollectEpoch') return doc._lastCollectEpoch ?? null;
  if (field === 'temperature' && isFreezerProbeDoc(doc)) {
    return freezerProbeTempF(doc);
  }
  if (NUMERIC_FIELDS.has(field)) {
    const v = doc[field];
    return v == null || Number.isNaN(Number(v)) ? null : Number(v);
  }
  const text = doc[field];
  if (text == null) return null;
  return String(text);
}

function coerceForTag(tag, raw) {
  if (raw == null) return tag.type === 'BOOL' ? false : 0;
  if (tag.type === 'BOOL') return !!raw;
  if (tag.type === 'INT') {
    if (typeof raw === 'number') return Math.trunc(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function tagAddress(tag) {
  const a = tag.driverAddress;
  if (!a || typeof a !== 'object') return null;
  const deviceId = String(a.deviceId || '').trim();
  const field = String(a.field || 'totalUsage').trim();
  if (!deviceId) return null;
  return { deviceId, field };
}

class NextcenturyDriver {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.connected = false;
    this._lastError = '';
    this._jwtToken = '';
    this._tokenExpiry = 0;
    this._deviceCache = new Map();
    this._lastPollAt = 0;
    this._lastCollectEpoch = 0;
    this._propertyIds = [];
    this._lastParsedReport = null;
    this._lastReportFile = null;
    this._lastSyncWarning = '';
  }

  health() {
    if (!this.connected) return this._lastError || 'disconnected';
    const warn = this._lastSyncWarning ? ` · ${this._lastSyncWarning}` : '';
    if (this.cfg.testConnection && this._lastReportFile) {
      const devs = this._deviceCache ? this._deviceCache.size : 0;
      return `OK · ${devs} device(s) · report saved to ${this._lastReportFile}${warn}`;
    }
    const age = this._lastPollAt ? Math.round((Date.now() - this._lastPollAt) / 1000) : null;
    return age != null ? `OK · last poll ${age}s ago${warn}` : `OK${warn}`;
  }

  /** Tag count and scan-load estimate for this driver (planning or live device cache). */
  deployEstimate(opts = {}) {
    const { estimateFromDriverInstance } = require('./nextcenturyDeployEstimate');
    return estimateFromDriverInstance(this.cfg, this, opts);
  }

  _pollIntervalMs() {
    const n = Number(this.cfg.pollIntervalMs);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_POLL_MS;
  }

  _credentials() {
    return resolveCredentials(this.cfg);
  }

  async _login() {
    if (this._jwtToken && Date.now() < this._tokenExpiry - 60_000) return;
    const auth = await loginNextcentury(
      this._credentials(),
      this.cfg.timeoutMs || 15000,
    );
    this._jwtToken = auth.token;
    this._tokenExpiry = auth.expiresAt;
  }

  async _apiGet(path) {
    await this._login();
    const res = await fetch(`${BASE_API_URL}${path}`, {
      headers: { Authorization: this._jwtToken },
      signal: AbortSignal.timeout(this.cfg.timeoutMs || 20000),
    });
    if (!res.ok) throw new Error(`NextCentury HTTP ${res.status} ${path}`);
    return res.json();
  }

  async _loadPropertyIds() {
    const configured = Array.isArray(this.cfg.propertyIds)
      ? this.cfg.propertyIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    if (configured.length) {
      this._propertyIds = configured;
      return;
    }
    const properties = await this._apiGet('/Properties');
    if (!Array.isArray(properties)) throw new Error('NextCentury: expected property array');
    this._propertyIds = properties
      .map((p) => (p._id?.startsWith('p_') ? parseInt(p._id.slice(2), 10) : null))
      .filter((id) => id != null && !Number.isNaN(id));
  }

  async _pollReports() {
    const reportId = String(this.cfg.reportId || DEFAULT_REPORT_ID).trim();
    const dateStr = reportDateStr();
    const delayMs = Number(this.cfg.propertyDelayMs) || PROPERTY_DELAY_MS;
    const nextCache = new Map();
    const collectedAt = Date.now();
    const parsedProperties = [];

    await this._loadPropertyIds();
    for (const propertyId of this._propertyIds) {
      const reqPath = `/Properties/${propertyId}/RunReport/${reportId}?start=${dateStr}&end=${dateStr}`;
      try {
        const data = await this._apiGet(reqPath);
        const rows = (data?.rows || []).map((row) => parseRt4510Row(row, propertyId));
        parsedProperties.push({ propertyId, rowCount: rows.length, rows });
        for (const doc of rows) {
          if (!doc.deviceId) continue;
          nextCache.set(doc.deviceId, {
            ...doc,
            _lastCollectEpoch: Math.floor(collectedAt / 1000),
          });
        }
      } catch (e) {
        this._lastError = `Property ${propertyId}: ${e.message}`;
        parsedProperties.push({ propertyId, error: e.message || String(e) });
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    this._deviceCache = nextCache;
    this._lastPollAt = collectedAt;
    this._lastCollectEpoch = Math.floor(collectedAt / 1000);
    this._lastParsedReport = {
      reportId,
      date: dateStr,
      collectedAt: new Date(collectedAt).toISOString(),
      propertyCount: this._propertyIds.length,
      deviceCount: nextCache.size,
      properties: parsedProperties,
    };
    this.connected = true;
    this._lastError = '';
  }

  /**
   * Write the last parsed report to data/nextcentury-reports as
   * <REPORT_ID>_<YYYY-MM-DD_HH-mm-ss>.json. Used by test-execute so the raw
   * parsed API result can be inspected offline. Returns the file path (or null).
   */
  _writeReportDump() {
    const report = this._lastParsedReport;
    if (!report) return null;
    const reportId = String(report.reportId || DEFAULT_REPORT_ID).trim().toUpperCase();
    const file = path.join(REPORT_DUMP_DIR, `${reportId}_${fileStamp()}.json`);
    try {
      fs.mkdirSync(REPORT_DUMP_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
      this._lastReportFile = file;
      return file;
    } catch (e) {
      this._lastError = `report dump failed: ${e.message || e}`;
      return null;
    }
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    try {
      await this._login();
      await this._loadPropertyIds();
      this.connected = true;
      this._lastError = '';
      // On a test-execute, actually run the report and dump the parsed JSON so
      // the raw API result is captured for inspection.
      if (this.cfg.testConnection) {
        await this._pollReports();
        this._writeReportDump();
      }
      return true;
    } catch (e) {
      this.connected = false;
      this._lastError = e.message || String(e);
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    this._jwtToken = '';
    this._tokenExpiry = 0;
    this._deviceCache.clear();
    this._lastPollAt = 0;
  }

  _applyCacheToTags(tags, store) {
    const meta = {
      _deviceCount: this._deviceCache.size,
      _lastCollectEpoch: this._lastCollectEpoch,
    };
    for (const tag of tags) {
      const addr = tagAddress(tag);
      if (!addr) {
        store.setValue(tag.id, store.get(tag.id)?.value ?? tag.default, QUALITY.STALE);
        continue;
      }
      let doc = null;
      if (addr.field === '_deviceCount' || addr.field === '_lastCollectEpoch') {
        doc = meta;
      } else {
        doc = this._deviceCache.get(addr.deviceId);
      }
      if (!doc) {
        store.setValue(tag.id, store.get(tag.id)?.value ?? tag.default, QUALITY.STALE);
        continue;
      }
      const raw = fieldValue(doc, addr.field);
      store.setValue(tag.id, coerceForTag(tag, raw), QUALITY.GOOD);
    }
  }

  async readBatch(tags, store) {
    const pollMs = this._pollIntervalMs();
    const due = !this._lastPollAt || Date.now() - this._lastPollAt >= pollMs;
    let polled = false;
    if (due) {
      try {
        await this._pollReports();
        polled = true;
      } catch (e) {
        this._lastError = e.message || String(e);
        this.connected = false;
      }
    }
    if (
      polled
      && this.cfg.autoSyncTags !== false
      && store
      && typeof store.list === 'function'
      && typeof store.replaceAll === 'function'
      && this.cfg.id
    ) {
      const merged = mergeNextcenturyTagsIntoStore(
        store.list(),
        this._deviceCache,
        this.cfg.id,
        {
          _deviceCount: this._deviceCache.size,
          _lastCollectEpoch: this._lastCollectEpoch,
        },
      );
      if (merged.ok) {
        store.replaceAll(merged.tags, { keepForces: true });
        try {
          const persistence = require('../persistence');
          const { syncNextcenturySemanticTags } = require('../settings/assistedLivingSettings');
          const settings = persistence.readJson('settings.json', {});
          syncNextcenturySemanticTags(store, settings.assistedLiving);
        } catch (e) {
          /* settings merge is best-effort after NC sync */
        }
        tags = store.list().filter(
          (t) => t.driverId === this.cfg.id && t.driverAddress,
        );
        this._lastSyncWarning = merged.warning || '';
      } else if (merged.error && !this._lastError) {
        this._lastError = merged.error;
      }
    }
    this._applyCacheToTags(tags, store);
  }

  async writeBatch() {
    /* read-only API */
  }
}

module.exports = {
  NextcenturyDriver,
  parseRt4510Row,
  leakIsActive,
  isFreezerProbeDoc,
  freezerProbeTempF,
  fieldValue,
  reportDateStr,
  fileStamp,
  REPORT_DUMP_DIR,
  resolveCredentials,
  loginNextcentury,
};
