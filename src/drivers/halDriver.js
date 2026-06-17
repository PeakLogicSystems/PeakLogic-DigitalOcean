'use strict';

const { QUALITY } = require('../tags/constants');
const { createHalBackend } = require('../hal');
const { parseHalAddress, isReadable, isWritable } = require('../hal/parseChannel');
const { HAL_KINDS } = require('../hal/halTypes');

class HalDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._lastError = '';
    this._backend = null;
  }

  health() {
    if (!this._backend) return this._lastError || 'not initialized';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  getStatus() {
    return this._backend?.getStatus?.() || { backend: 'none', connected: false };
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    try {
      this._backend = createHalBackend(this.cfg);
      const ok = await this._backend.connect();
      this.connected = !!ok;
      if (!ok) this._lastError = this._backend.getStatus?.().lastError || 'HAL connect failed';
      else this._lastError = '';
      return this.connected;
    } catch (e) {
      this._lastError = e.message || String(e);
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    if (this._backend) {
      try { await this._backend.disconnect(); } catch { /* ignore */ }
    }
    this.connected = false;
  }

  _coerceValue(tag, raw) {
    if (tag.type === 'BOOL') return !!raw;
    if (tag.type === 'REAL') return Number(raw);
    return Math.trunc(Number(raw));
  }

  async readBatch(tags, store) {
    if (!this.connected || !this._backend) return;
    for (const t of tags) {
      const ch = parseHalAddress(t.driverAddress);
      if (!ch || !isReadable(ch.kind)) {
        continue;
      }
      try {
        const raw = this._backend.read(ch.kind, ch.index, ch.field);
        store.setValue(t.id, this._coerceValue(t, raw), QUALITY.GOOD);
      } catch (e) {
        store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
        this._lastError = e.message;
      }
    }
  }

  async writeBatch(tags, store) {
    if (!this.connected || !this._backend) return;
    for (const t of tags) {
      const ch = parseHalAddress(t.driverAddress);
      if (!ch || !isWritable(ch.kind)) continue;
      const v = store.get(t.id)?.value;
      try {
        this._backend.write(ch.kind, ch.index, t.type === 'BOOL' ? (v ? 1 : 0) : Number(v));
      } catch (e) {
        this._lastError = e.message;
      }
    }
  }
}

module.exports = { HalDriver, HAL_KINDS };
