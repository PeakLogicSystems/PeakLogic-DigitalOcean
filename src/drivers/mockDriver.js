'use strict';

const { QUALITY } = require('../tags/constants');

class MockDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._sim = cfg.simValues || {};
  }

  health() {
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async readBatch(tags, store) {
    for (const t of tags) {
      const addr = t.driverAddress?.channel ?? t.id;
      if (this._sim[addr] !== undefined) {
        store.setValue(t.id, this._sim[addr], QUALITY.GOOD);
      }
    }
  }

  async writeBatch(tags, store) {
    for (const t of tags) {
      const addr = t.driverAddress?.channel ?? t.id;
      const v = store.get(t.id)?.value;
      this._sim[addr] = v;
    }
  }
}

module.exports = { MockDriver };
