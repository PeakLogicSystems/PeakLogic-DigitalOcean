'use strict';

const { QUALITY } = require('../tags/constants');
const { parsePayload, formatPayloadForWrite, tagValueFromParsed } = require('./payloadTemplate');

function resolveUrl(baseUrl, pathOrUrl) {
  const path = String(pathOrUrl || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function tagPath(tag) {
  const a = tag.driverAddress || {};
  return a.url || a.path || a.topic || '';
}

class HttpsDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._cache = new Map();
    this._cacheTs = new Map();
    this._lastError = '';
  }

  health() {
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    const base = this.cfg.baseUrl || this.cfg.url;
    if (!base) {
      this._lastError = 'baseUrl required';
      this.connected = false;
      return false;
    }
    try {
      const headers = this._headers();
      const res = await fetch(base, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(this.cfg.timeoutMs || 8000),
      });
      this.connected = res.ok || res.status === 405 || res.status === 404;
      if (!this.connected) this._lastError = `HTTP ${res.status}`;
      else this._lastError = '';
      return this.connected;
    } catch (e) {
      this.connected = true;
      this._lastError = '';
      return true;
    }
  }

  async disconnect() {
    this.connected = false;
    this._cache.clear();
    this._cacheTs.clear();
  }

  _headers(extra = {}) {
    const headers = { Accept: 'application/json, text/plain, */*', ...extra };
    if (this.cfg.bearerToken) headers.Authorization = `Bearer ${this.cfg.bearerToken}`;
    if (this.cfg.headers && typeof this.cfg.headers === 'object') {
      Object.assign(headers, this.cfg.headers);
    }
    return headers;
  }

  async _fetchUrl(url) {
    const pollMs = Number(this.cfg.pollIntervalMs) || 0;
    const now = Date.now();
    const cached = this._cache.get(url);
    const ts = this._cacheTs.get(url) || 0;
    if (pollMs > 0 && cached !== undefined && now - ts < pollMs) {
      return cached;
    }
    const res = await fetch(url, {
      method: this.cfg.method || 'GET',
      headers: this._headers(),
      signal: AbortSignal.timeout(this.cfg.timeoutMs || 10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const body = await res.text();
    this._cache.set(url, body);
    this._cacheTs.set(url, Date.now());
    return body;
  }

  async readBatch(tags, store) {
    const urls = new Set();
    for (const t of tags) {
      const url = resolveUrl(this.cfg.baseUrl || this.cfg.url, tagPath(t));
      if (url) urls.add(url);
    }
    for (const url of urls) {
      try {
        await this._fetchUrl(url);
        this.connected = true;
        this._lastError = '';
      } catch (e) {
        this._lastError = e.message;
        this.connected = false;
      }
    }
    for (const t of tags) {
      const url = resolveUrl(this.cfg.baseUrl || this.cfg.url, tagPath(t));
      if (!url) continue;
      const raw = this._cache.get(url);
      if (raw === undefined) {
        store.setValue(t.id, store.get(t.id)?.value ?? t.default, QUALITY.STALE);
        continue;
      }
      const a = t.driverAddress || {};
      const val = parsePayload(raw, a.payloadTemplate);
      store.setValue(t.id, tagValueFromParsed(t, val), QUALITY.GOOD);
    }
  }

  async writeBatch(tags, store) {
    for (const t of tags) {
      const url = resolveUrl(this.cfg.baseUrl || this.cfg.url, tagPath(t));
      if (!url) continue;
      const a = t.driverAddress || {};
      const v = store.get(t.id)?.value;
      const payload = formatPayloadForWrite(v, a.payloadTemplate);
      const method = a.writeMethod || this.cfg.writeMethod || 'POST';
      const headers = this._headers({
        'Content-Type': a.payloadTemplate === 'json' || String(a.payloadTemplate || '').startsWith('json:')
          ? 'application/json'
          : 'text/plain',
      });
      await fetch(url, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(this.cfg.timeoutMs || 10000),
      });
    }
  }
}

module.exports = { HttpsDriver, resolveUrl, tagPath };
