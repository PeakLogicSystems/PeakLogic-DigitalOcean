'use strict';

const { HAL_KINDS, DEFAULT_LIMITS } = require('./halTypes');
const { formatPin } = require('./parseChannel');

function emptyMaps(limits) {
  return {
    di: new Map(),
    do: new Map(),
    ai: new Map(),
    ao: new Map(),
    cnt: new Map(),
  };
}

/**
 * In-process HAL for dev / Windows / Linux without a board plugin.
 * Counters can follow a DI edge (counterBindings) or accept manual sim values.
 */
class SimHalBackend {
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.limits = { ...DEFAULT_LIMITS, ...(cfg.limits || {}) };
    this.maps = emptyMaps(this.limits);
    this._prevDi = new Map();
    this._counterBindings = cfg.counterBindings || {};
    this._connected = false;
    this._seedSimValues(cfg.simValues || {});
  }

  _seedSimValues(sim) {
    for (const [pin, val] of Object.entries(sim)) {
      const kind = pin.startsWith('DI') ? HAL_KINDS.DI
        : pin.startsWith('DO') ? HAL_KINDS.DO
          : pin.startsWith('AI') ? HAL_KINDS.AI
            : pin.startsWith('AO') ? HAL_KINDS.AO
              : pin.startsWith('CNT') ? HAL_KINDS.CNT : null;
      if (!kind) continue;
      const index = parseInt(pin.replace(/^\D+/, ''), 10);
      if (kind === HAL_KINDS.CNT) {
        this.maps.cnt.set(index, { count: Number(val) || 0, freqHz: 0, lastMs: Date.now() });
      } else if (kind === HAL_KINDS.DI || kind === HAL_KINDS.DO) {
        this.maps[kind].set(index, !!val);
      } else {
        this.maps[kind].set(index, Number(val) || 0);
      }
    }
  }

  async connect() {
    this._connected = true;
    return true;
  }

  async disconnect() {
    this._connected = false;
  }

  _checkIndex(kind, index) {
    const max = this.limits[kind];
    if (index < 0 || index >= max) {
      throw new Error(`HAL ${kind} index ${index} out of range (0..${max - 1})`);
    }
  }

  _tickCounters() {
    const now = Date.now();
    for (const [cntIndex, binding] of Object.entries(this._counterBindings)) {
      const idx = parseInt(cntIndex, 10);
      const src = binding?.pulseDi;
      if (src == null) continue;
      const m = String(src).match(/DI(\d+)/i);
      if (!m) continue;
      const diIdx = parseInt(m[1], 10);
      const cur = !!this.maps.di.get(diIdx);
      const prev = !!this._prevDi.get(diIdx);
      if (cur && !prev) {
        const rec = this.maps.cnt.get(idx) || { count: 0, freqHz: 0, lastMs: now };
        rec.count += 1;
        const dt = (now - rec.lastMs) / 1000;
        if (dt > 0) rec.freqHz = 1 / dt;
        rec.lastMs = now;
        this.maps.cnt.set(idx, rec);
      }
      this._prevDi.set(diIdx, cur);
    }
  }

  read(kind, index, field) {
    this._checkIndex(kind, index);
    this._tickCounters();
    if (kind === HAL_KINDS.DI) return this.maps.di.get(index) ? 1 : 0;
    if (kind === HAL_KINDS.DO) return this.maps.do.get(index) ? 1 : 0;
    if (kind === HAL_KINDS.AI) return this.maps.ai.get(index) ?? 0;
    if (kind === HAL_KINDS.AO) return this.maps.ao.get(index) ?? 0;
    if (kind === HAL_KINDS.CNT) {
      const rec = this.maps.cnt.get(index) || { count: 0, freqHz: 0 };
      if (field === 'freq' || field === 'frequency') return rec.freqHz;
      return rec.count;
    }
    return 0;
  }

  write(kind, index, value) {
    this._checkIndex(kind, index);
    if (kind === HAL_KINDS.DO) {
      this.maps.do.set(index, !!value);
      return;
    }
    if (kind === HAL_KINDS.AO) {
      this.maps.ao.set(index, Number(value) || 0);
      return;
    }
    throw new Error(`HAL ${kind} is read-only`);
  }

  getStatus() {
    const snapshot = (map, kind) => {
      const out = {};
      for (const [i, v] of map.entries()) out[formatPin(kind, i)] = v;
      return out;
    };
    const counters = {};
    for (const [i, rec] of this.maps.cnt.entries()) {
      counters[formatPin(HAL_KINDS.CNT, i)] = { ...rec };
    }
    return {
      backend: 'sim',
      connected: this._connected,
      limits: this.limits,
      di: snapshot(this.maps.di, HAL_KINDS.DI),
      do: snapshot(this.maps.do, HAL_KINDS.DO),
      ai: snapshot(this.maps.ai, HAL_KINDS.AI),
      ao: snapshot(this.maps.ao, HAL_KINDS.AO),
      counters,
      counterBindings: this._counterBindings,
    };
  }
}

module.exports = { SimHalBackend };
