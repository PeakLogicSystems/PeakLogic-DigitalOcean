'use strict';

const persistence = require('../persistence');
const { QUALITY } = require('../tags/constants');
const { parseProgram, validateProgram } = require('../engine/parser');
const { astToJson } = require('../engine/astJson');

function baseUrl(cfg) {
  const host = String(cfg.host || cfg.baseUrl || '127.0.0.1').replace(/^https?:\/\//i, '').split('/')[0];
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
  }

  health() {
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _headers(extra = {}) {
    const headers = { Accept: 'application/json', ...extra };
    if (this.cfg.bearerToken) headers.Authorization = `Bearer ${this.cfg.bearerToken}`;
    return headers;
  }

  async _request(path, options = {}) {
    const url = `${this._base}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: this._headers(options.headers || {}),
      signal: AbortSignal.timeout(this.cfg.timeoutMs || 8000),
    });
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    if (!res.ok) {
      const msg = body?.error || body?.message || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    this._base = baseUrl(this.cfg);
    try {
      const st = await this._request('/api/status');
      this.connected = !!st;
      this._lastError = '';
      return true;
    } catch (e) {
      this.connected = false;
      this._lastError = e.message || String(e);
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
    const tagIds = tagStore.list().map((t) => t.id);
    const { ast, errors: parseErrs } = parseProgram(source);
    if (parseErrs.length) return { ok: false, errors: parseErrs };
    const valErrs = validateProgram(ast, tagIds);
    if (valErrs.length) return { ok: false, errors: valErrs };
    const tags = tagStore.list()
      .filter((t) => tagIds.includes(t.id) || t.driverId === this.cfg.id)
      .map((t) => this._tagMetaForDevice(t));
    const body = {
      source,
      ast: astToJson(ast),
      tagIds,
      tags,
    };
    await this._request('/api/program', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: true, errors: [] };
  }

  async startRuntime() {
    const scanMs = Number(this.cfg.scanMs) || 100;
    await this._request('/api/runtime/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanMs }),
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
}

module.exports = { OptaRemoteDriver, baseUrl, tagChannel };
