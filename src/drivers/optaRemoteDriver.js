'use strict';

const { QUALITY } = require('../tags/constants');
const { buildOptaProgramBody, slimPutProgramBodyForMqtt } = require('../parc/mqttOptaProgram');
const { optaHttpRequest } = require('./optaHttpClient');
const programStore = require('../programs/programStore');
const {
  checkOptaDeviceStatus,
  clientHeaders,
  clientDeployMeta,
  OPTA_PROGRAM_MAX_BYTES,
} = require('./optaProtocol');

const DEFAULT_TIMEOUT_MS = 8000;
const PROGRAM_TIMEOUT_MS = 30000;

function baseUrl(cfg) {
  const host = String(cfg.host || cfg.baseUrl || '127.0.0.1')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .trim();
  const port = Number(cfg.port) || 80;
  const scheme = cfg.tls ? 'https' : 'http';
  return port === 80 && !cfg.tls ? `http://${host}` : `${scheme}://${host}:${port}`;
}

function tagChannel(tag) {
  const ch = tag.driverAddress?.channel ?? tag.driverAddress?.id;
  return String(ch || tag.id || '').trim();
}

class OptaRemoteDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._lastError = '';
    this._base = '';
    this._versionWarnings = [];
    this._deviceStatus = null;
  }

  health() {
    if (this.connected && this._versionWarnings.length) {
      return `OK — ${this._versionWarnings[0]}`;
    }
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _headers(extra = {}) {
    const headers = { Accept: 'application/json', ...clientHeaders(), ...extra };
    if (this.cfg.bearerToken) headers.Authorization = `Bearer ${this.cfg.bearerToken}`;
    return headers;
  }

  _timeoutMs(options = {}, fallback = DEFAULT_TIMEOUT_MS) {
    return options.timeoutMs ?? this.cfg.timeoutMs ?? fallback;
  }

  async _request(path, options = {}) {
    if (!this._base) this._base = baseUrl(this.cfg);
    const url = `${this._base}${path}`;
    const { timeoutMs, methods, ...rest } = options;
    return optaHttpRequest(url, {
      ...rest,
      timeoutMs: this._timeoutMs({ timeoutMs }, DEFAULT_TIMEOUT_MS),
      methods: methods || [rest.method || 'GET'],
      headers: this._headers(rest.headers || {}),
    });
  }

  async ensureConnected() {
    this._base = baseUrl(this.cfg);
    if (this.connected) {
      try {
        await this._request('/api/status', { timeoutMs: DEFAULT_TIMEOUT_MS });
        return true;
      } catch {
        this.connected = false;
      }
    }
    return this.connect(this.cfg);
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    this._base = baseUrl(this.cfg);
    try {
      const st = await this._request('/api/status');
      const check = checkOptaDeviceStatus(st);
      this._deviceStatus = st;
      this._versionWarnings = check.warnings;
      if (!check.ok) {
        this.connected = false;
        this._lastError = check.errors.join('; ');
        return false;
      }
      this.connected = st?.ok !== false;
      this._lastError = this.connected ? '' : (st?.error || 'Opta status not ok');
      return this.connected;
    } catch (e) {
      this.connected = false;
      this._lastError = e.message || String(e);
      this._versionWarnings = [];
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.cfg.remoteExecution) {
      try {
        await this._request('/api/runtime/stop', { method: 'POST' });
      } catch { /* ignore */ }
    }
  }

  async _fetchTags() {
    return this._request('/api/tags');
  }

  _applyTagsPayload(payload, tags, store, roleFilter) {
    const map = payload?.tags || payload || {};
    for (const t of tags) {
      if (roleFilter && !roleFilter(t)) continue;
      const key = tagChannel(t);
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      const raw = map[key];
      let val = raw;
      if (t.type === 'BOOL') val = !!raw;
      else if (t.type === 'INT') val = Math.trunc(Number(raw) || 0);
      else if (t.type === 'REAL') val = Number(raw) || 0;
      store.setValue(t.id, val, QUALITY.GOOD);
    }
  }

  async readBatch(tags, store) {
    if (this.cfg.remoteExecution) return;
    try {
      const payload = await this._fetchTags();
      this._applyTagsPayload(payload, tags, store);
      this.connected = true;
      this._lastError = '';
    } catch (e) {
      this._lastError = e.message;
      this.connected = false;
      for (const t of tags) {
        store.setValue(t.id, store.get(t.id)?.value ?? t.value, QUALITY.STALE);
      }
    }
  }

  async writeBatch(tags, store) {
    if (this.cfg.remoteExecution) return;
    const outputs = {};
    for (const t of tags) {
      const key = tagChannel(t);
      const v = store.get(t.id)?.value;
      outputs[key] = t.type === 'BOOL' ? !!v : Number(v) || 0;
    }
    if (!Object.keys(outputs).length) return;
    try {
      await this._request('/api/tags/outputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs }),
      });
      this.connected = true;
      this._lastError = '';
    } catch (e) {
      this._lastError = e.message;
      this.connected = false;
      throw e;
    }
  }

  _tagMetaForDevice(t) {
    const o = { id: t.id, type: t.type, role: t.role };
    if (t.preset != null) o.preset = t.preset;
    if (t.mode) o.mode = t.mode;
    if (t.kp != null) o.kp = t.kp;
    if (t.ki != null) o.ki = t.ki;
    if (t.kd != null) o.kd = t.kd;
    if (t.outMin != null) o.outMin = t.outMin;
    if (t.outMax != null) o.outMax = t.outMax;
    if (t.value != null) o.value = t.value;
    return o;
  }

  async deployProgram(source, tagStore) {
    const built = buildOptaProgramBody(source, tagStore, this.cfg.id, { includeSource: false });
    if (!built.ok) return { ok: false, errors: built.errors || ['Program invalid'] };
    if (!(await this.ensureConnected())) {
      return {
        ok: false,
        errors: [this._lastError || `Cannot reach Opta at ${baseUrl(this.cfg)} — use Connect or check driver host/port`],
      };
    }
    const limit = Number(this._deviceStatus?.programMaxBytes) || OPTA_PROGRAM_MAX_BYTES;
    const deployBody = slimPutProgramBodyForMqtt(built.body, built.traceMap);
    const payload = JSON.stringify({
      ...deployBody,
      ...clientDeployMeta({ programName: programStore.activeRel() || '' }),
    });
    const payloadBytes = Buffer.byteLength(payload);
    if (payloadBytes >= limit) {
      return {
        ok: false,
        errors: [
          `Program deploy is ${payloadBytes} bytes (Opta limit ${limit}). `
          + 'Trim the ST program or re-flash est-pc/firmware/arduino-opta-st (MV_PROGRAM_JSON_MAX).',
        ],
      };
    }
    try {
      JSON.parse(payload);
    } catch (e) {
      return { ok: false, errors: [`Deploy payload is not valid JSON: ${e.message}`] };
    }
    const programTimeout = this.cfg.programTimeoutMs || PROGRAM_TIMEOUT_MS;
    try {
      await this._request('/api/program', {
        methods: ['PUT', 'POST'],
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        timeoutMs: programTimeout,
      });
    } catch (e) {
      const msg = e.message || String(e);
      let extra = '';
      if (/ECONNRESET|connection was reset|fetch failed/i.test(msg)) {
        extra = ' — Opta reset the HTTP connection (power-cycle Opta, re-flash est-pc firmware, allow Node.js through Windows Firewall)';
      } else if (/program too large|body too large/i.test(msg)) {
        extra = ` (${payloadBytes} bytes, limit ${limit})`;
      } else if (/timeout|aborted/i.test(msg)) {
        extra = ` (${payloadBytes} bytes — check Opta Serial for PUT/POST /api/program)`;
      } else if (/invalid json|json NoMemory|incomplete body/i.test(msg)) {
        extra = ` (${payloadBytes} bytes — re-flash est-pc/firmware/arduino-opta-st/PeaklogicOptaSt; old firmware returns "invalid json" for large programs)`;
      }
      return { ok: false, errors: [`${msg}${extra}`] };
    }
    return { ok: true, errors: [] };
  }

  async startRuntime() {
    if (!(await this.ensureConnected())) {
      throw new Error(this._lastError || `Cannot reach Opta at ${baseUrl(this.cfg)}`);
    }
    const scanMs = Number(this.cfg.scanMs) || 100;
    await this._request('/api/runtime/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanMs }),
      timeoutMs: this.cfg.programTimeoutMs || PROGRAM_TIMEOUT_MS,
    });
  }

  async stopRuntime() {
    await this._request('/api/runtime/stop', { method: 'POST' });
  }

  async runScanCycle(store) {
    const payload = await this._request('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanMs: Number(this.cfg.scanMs) || 100 }),
    });
    const maps = store.list().filter((t) => t.driverId === this.cfg.id);
    this._applyTagsPayload(payload, maps, store);
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      this._lastError = payload.errors.join('; ');
    } else {
      this._lastError = '';
    }
    this.connected = true;
    return payload;
  }

  /** Upload compiled .bin firmware over HTTP OTA (device reboots on success). */
  async uploadFirmware(firmwareBytes, opts = {}) {
    const url = `${this._base}/api/firmware`;
    const headers = { 'Content-Type': 'application/octet-stream', Accept: 'application/json' };
    const pwd = opts.password ?? this.cfg.otaPassword;
    if (pwd) headers['X-MV-OTA-Password'] = String(pwd);
    const body = firmwareBytes instanceof Buffer
      ? firmwareBytes
      : Buffer.from(firmwareBytes);
    const { optaHttpRequest: uploadReq } = require('./optaHttpClient');
    return uploadReq(url, {
      method: 'POST',
      headers: this._headers(headers),
      body,
      timeoutMs: opts.timeoutMs || this.cfg.otaTimeoutMs || 180000,
    });
  }

  async otaInfo() {
    return this._request('/api/ota');
  }
}

module.exports = { OptaRemoteDriver, baseUrl, tagChannel };
