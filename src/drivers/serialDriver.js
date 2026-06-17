'use strict';

const { QUALITY } = require('../tags/constants');

let native = null;
try {
  native = require('../../build/Release/mooreview_native.node');
} catch {
  native = null;
}

class SerialDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._handle = null;
  }

  health() {
    if (!native) return 'native addon not built';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  async connect() {
    if (!native?.serialOpen) {
      this._lastError = 'serial native module unavailable';
      return;
    }
    this._handle = native.serialOpen(
      this.cfg.port || '/dev/ttyUSB0',
      this.cfg.baud || 115200,
      this.cfg.profile || 'default'
    );
    this.connected = this._handle >= 0;
    if (!this.connected) this._lastError = 'serialOpen failed';
  }

  async disconnect() {
    if (native?.serialClose && this._handle >= 0) native.serialClose(this._handle);
    this.connected = false;
    this._handle = null;
  }

  async readBatch(tags, store) {
    if (!this.connected || !native?.serialRead) return;
    for (const t of tags) {
      const ch = t.driverAddress?.channel ?? 0;
      try {
        const v = native.serialRead(this._handle, ch);
        store.setValue(t.id, t.type === 'BOOL' ? !!v : Number(v), QUALITY.GOOD);
      } catch (e) {
        store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
        this._lastError = e.message;
      }
    }
  }

  async writeBatch(tags, store) {
    if (!this.connected || !native?.serialWrite) return;
    for (const t of tags) {
      const ch = t.driverAddress?.channel ?? 0;
      const v = store.get(t.id)?.value;
      try {
        native.serialWrite(this._handle, ch, Number(v));
      } catch (e) {
        this._lastError = e.message;
      }
    }
  }
}

module.exports = { SerialDriver };
