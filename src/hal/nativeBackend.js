'use strict';

const { HAL_KINDS, DEFAULT_LIMITS } = require('./halTypes');
const { formatPin } = require('./parseChannel');

let native = null;
try {
  native = require('../../native/build/Release/peaklogic_native.node');
} catch {
  native = null;
}

const KIND_TO_CODE = {
  [HAL_KINDS.DI]: 0,
  [HAL_KINDS.DO]: 1,
  [HAL_KINDS.AI]: 2,
  [HAL_KINDS.AO]: 3,
  [HAL_KINDS.CNT]: 4,
};

/**
 * Linux HAL backend: optional board plugin (.so) via native addon.
 * Falls back to in-addon simulation when plugin is missing or on non-Linux.
 */
class NativeHalBackend {
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.limits = { ...DEFAULT_LIMITS, ...(cfg.limits || {}) };
    this._connected = false;
    this._lastError = '';
    this._handle = -1;
  }

  async connect() {
    if (!native?.halOpen) {
      this._lastError = 'native HAL not built (run: npm run build-native)';
      return false;
    }
    const pluginPath = this.cfg.pluginPath || this.cfg.libraryPath || '';
    const configJson = JSON.stringify({
      limits: this.limits,
      ...(this.cfg.halConfig || {}),
    });
    const handle = native.halOpen(pluginPath, configJson);
    if (handle < 0) {
      this._lastError = `halOpen failed (${handle})`;
      return false;
    }
    this._handle = handle;
    this._connected = true;
    return true;
  }

  async disconnect() {
    if (native?.halClose && this._handle >= 0) {
      try { native.halClose(this._handle); } catch { /* ignore */ }
    }
    this._handle = -1;
    this._connected = false;
  }

  _code(kind) {
    const c = KIND_TO_CODE[kind];
    if (c == null) throw new Error(`Unknown HAL kind ${kind}`);
    return c;
  }

  read(kind, index, field) {
    if (!this._connected || !native?.halRead) throw new Error('HAL not connected');
    if (kind === HAL_KINDS.CNT && (field === 'freq' || field === 'frequency')) {
      if (native.halCounterRead) {
        const r = native.halCounterRead(this._handle, index);
        return r?.freqHz ?? 0;
      }
    }
    return native.halRead(this._handle, this._code(kind), index);
  }

  write(kind, index, value) {
    if (!this._connected || !native?.halWrite) throw new Error('HAL not connected');
    native.halWrite(this._handle, this._code(kind), index, Number(value));
  }

  getStatus() {
    let plugin = '';
    if (native?.halPluginName && this._handle >= 0) {
      try { plugin = native.halPluginName(this._handle) || ''; } catch { /* ignore */ }
    }
    return {
      backend: 'native',
      connected: this._connected,
      plugin,
      pluginPath: this.cfg.pluginPath || '',
      limits: this.limits,
      lastError: this._lastError,
    };
  }
}

module.exports = { NativeHalBackend, nativeAvailable: () => !!native?.halOpen };
