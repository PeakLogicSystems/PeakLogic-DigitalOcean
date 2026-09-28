'use strict';

const { QUALITY } = require('../tags/constants');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('./fieldbusPoll');
const {
  DEVICE_CLASS,
  frameSetSpeed,
  parsePumpStatus,
  normalizeDeviceClass,
  pointValue,
  findGoldlineFrame,
  DEFAULT_PUMP_HUA,
  pctToRpm,
} = require('./haywardProtocol');

let SerialPort = null;
try {
  ({ SerialPort } = require('serialport'));
} catch {
  SerialPort = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class HaywardDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.port = null;
    this.connected = false;
    this._lastError = '';
    this._ioChain = Promise.resolve();
    this._cache = new Map();
    this._lastSpeedSent = new Map();
  }

  health() {
    if (!SerialPort) return 'serialport module unavailable';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _parity(p) {
    const map = { none: 'none', even: 'even', odd: 'odd' };
    return map[String(p || 'none').toLowerCase()] || 'none';
  }

  _deviceClassForTag(tag) {
    return normalizeDeviceClass(tag.driverAddress?.deviceClass ?? this.cfg.deviceClass);
  }

  _addrForTag(tag) {
    const a = tag.driverAddress?.deviceAddr ?? tag.driverAddress?.hua ?? tag.driverAddress?.slaveId
      ?? this.cfg.deviceAddr ?? this.cfg.hua ?? this.cfg.slaveId;
    if (a != null && Number.isFinite(Number(a))) return Number(a);
    return DEFAULT_PUMP_HUA;
  }

  _timeoutMs() {
    return Math.min(Math.max(Number(this.cfg.timeoutMs) || 1500, 200), 5000);
  }

  _frameDelayMs() {
    return Math.max(Number(this.cfg.frameDelayMs) || 30, 10);
  }

  _keepaliveMs() {
    return Math.max(Number(this.cfg.keepaliveMs) || 1000, 500);
  }

  _maxRpm() {
    return Math.max(Number(this.cfg.maxRpm) || 3450, 1000);
  }

  _pointForTag(tag) {
    return tag.driverAddress?.hayward || tag.driverAddress?.point || '';
  }

  _enqueue(fn) {
    const run = this._ioChain.then(fn, fn);
    this._ioChain = run.catch(() => {});
    return run;
  }

  async connect(cfg) {
    const c = cfg || this.cfg;
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    this.connected = false;
    this._lastError = '';
    if (!SerialPort) {
      this._lastError = 'serialport module unavailable';
      return false;
    }
    try {
      if (this.port?.isOpen) await this.port.close();
      this.port = new SerialPort({
        path: c.serialPort || 'COM3',
        baudRate: c.baud || 19200,
        dataBits: 8,
        parity: this._parity(c.parity),
        stopBits: c.stopBits ?? 2,
        autoOpen: false,
      });
      await new Promise((resolve, reject) => {
        this.port.open((err) => (err ? reject(err) : resolve()));
      });
      this.port.on('error', (err) => {
        this._lastError = err.message || String(err);
        this.connected = false;
      });
      this.connected = true;
      return true;
    } catch (e) {
      this._lastError = e.message || String(e);
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.port?.isOpen) {
      try { await this.port.close(); } catch { /* ignore */ }
    }
    this.port = null;
  }

  async _readStatus(timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer;
      const chunks = [];
      let total = 0;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.port.off('data', onData);
        this.port.off('error', onErr);
      };
      const finish = (err, data) => {
        cleanup();
        if (err) reject(err);
        else resolve(data);
      };
      const onErr = (err) => finish(err);
      const onData = (chunk) => {
        chunks.push(chunk);
        total += chunk.length;
        const merged = Buffer.concat(chunks, total);
        const frame = findGoldlineFrame(merged);
        if (frame.ok) finish(null, merged);
        else if (total > 256) finish(null, merged);
      };
      timer = setTimeout(() => finish(new Error(`Hayward timeout after ${timeoutMs}ms`)), timeoutMs);
      this.port.on('data', onData);
      this.port.on('error', onErr);
    });
  }

  async _sendSpeed(deviceAddr, speedPct) {
    const req = frameSetSpeed(deviceAddr, speedPct, this.cfg.useSimpleFrames !== false);
    await new Promise((resolve, reject) => {
      this.port.write(req, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      this.port.drain((err) => (err ? reject(err) : resolve()));
    });
    this._lastSpeedSent.set(deviceAddr, speedPct);
  }

  _groupTags(tags) {
    const groups = new Map();
    for (const t of tags) {
      const addr = this._addrForTag(t);
      const key = `${normalizeDeviceClass(this._deviceClassForTag(t))}:${addr}`;
      if (!groups.has(key)) {
        groups.set(key, { deviceClass: DEVICE_CLASS.VS_PUMP, deviceAddr: addr, tags: [] });
      }
      groups.get(key).tags.push(t);
    }
    return groups;
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    if (shouldSkipFieldbusPoll(this, this.cfg)) return;
    await this._enqueue(async () => {
      try {
        const groups = this._groupTags(tags);
        for (const { deviceAddr, tags: groupTags } of groups.values()) {
          const lastSpeed = this._lastSpeedSent.get(deviceAddr) ?? 0;
          await this._sendSpeed(deviceAddr, lastSpeed);
          await sleep(this._frameDelayMs());
          let status = { ok: false, error: 'no response' };
          try {
            const rsp = await this._readStatus(this._timeoutMs());
            status = parsePumpStatus(rsp);
          } catch {
            status = {
              ok: true,
              speedPct: lastSpeed,
              rpm: pctToRpm(lastSpeed, this._maxRpm()),
              watts: 0,
              running: lastSpeed > 0,
            };
          }
          if (!status.ok) {
            status = {
              ok: true,
              speedPct: lastSpeed,
              rpm: pctToRpm(lastSpeed, this._maxRpm()),
              watts: 0,
              running: lastSpeed > 0,
            };
          } else {
            status.rpm = pctToRpm(status.speedPct, this._maxRpm());
          }
          this._cache.set(deviceAddr, status);
          const ctx = { pump: status };
          for (const t of groupTags) {
            const point = this._pointForTag(t);
            const raw = pointValue(point, ctx);
            if (raw == null) continue;
            const val = t.type === 'BOOL' ? !!raw : (t.type === 'INT' ? Math.round(Number(raw)) : Number(raw));
            store.setValue(t.id, val, status.ok ? QUALITY.GOOD : QUALITY.BAD);
          }
          await sleep(this._keepaliveMs());
        }
        markFieldbusPolled(this);
      } catch (e) {
        this._lastError = e.message || String(e);
        for (const t of tags) {
          store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
        }
      }
    });
  }

  async writeBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    await this._enqueue(async () => {
      try {
        const byGroup = this._groupTags(tags);
        for (const { deviceAddr, tags: groupTags } of byGroup.values()) {
          let speedPct = null;
          let run = null;
          for (const t of groupTags) {
            const point = this._pointForTag(t);
            const v = store.get(t.id)?.value;
            if (point === 'speed_cmd') speedPct = Math.round(Number(v) || 0);
            if (point === 'run_cmd') run = !!v;
          }
          if (run === false) speedPct = 0;
          if (speedPct == null) continue;
          await this._sendSpeed(deviceAddr, speedPct);
          await sleep(this._frameDelayMs());
        }
      } catch (e) {
        this._lastError = e.message || String(e);
      }
    });
  }
}

module.exports = { HaywardDriver };
