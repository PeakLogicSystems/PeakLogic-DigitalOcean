'use strict';

const { QUALITY } = require('../tags/constants');

let native = null;
try {
  native = require('../../native/build/Release/peaklogic_native.node');
} catch {
  native = null;
}

class NativeSoDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
  }

  health() {
    if (!native) return 'native addon not built';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  async connect() {
    if (!native?.ioInit) {
      this._lastError = 'custom io native module unavailable';
      return;
    }
    const ok = native.ioInit(this.cfg.libraryPath || '', this.cfg.configJson || '{}');
    this.connected = ok === 0;
    if (!this.connected) this._lastError = 'ioInit failed';
  }

  async disconnect() {
    if (native?.ioShutdown) native.ioShutdown();
    this.connected = false;
  }

  async readBatch(tags, store) {
    if (!this.connected || !native?.ioRead) return;
    for (const t of tags) {
      const ch = t.driverAddress?.channel ?? 0;
      try {
        const v = native.ioRead(ch);
        store.setValue(t.id, t.type === 'BOOL' ? !!v : Number(v), QUALITY.GOOD);
      } catch (e) {
        store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
        this._lastError = e.message;
      }
    }
  }

  async writeBatch(tags, store) {
    if (!this.connected || !native?.ioWrite) return;
    for (const t of tags) {
      const ch = t.driverAddress?.channel ?? 0;
      const v = store.get(t.id)?.value;
      try {
        native.ioWrite(ch, Number(v));
      } catch (e) {
        this._lastError = e.message;
      }
    }
  }
}

module.exports = { NativeSoDriver };
