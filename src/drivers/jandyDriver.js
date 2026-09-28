'use strict';

const { QUALITY } = require('../tags/constants');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('./fieldbusPoll');
const {
  DEVICE_CLASS,
  buildStatusRequest,
  parseStatusResponse,
  frameEpumpRpm,
  frameEpumpWatts,
  frameAquapurePercent,
  normalizeDeviceClass,
  defaultAddr,
  pointValue,
  expectedResponseCmd,
  findFrame,
} = require('./jandyProtocol');

let SerialPort = null;
try {
  ({ SerialPort } = require('serialport'));
} catch {
  SerialPort = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function groupKey(deviceClass, deviceAddr) {
  return `${normalizeDeviceClass(deviceClass)}:${Number(deviceAddr)}`;
}

class JandyDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.port = null;
    this.connected = false;
    this._lastError = '';
    this._ioChain = Promise.resolve();
    this._cache = new Map();
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
    const raw = tag.driverAddress?.deviceClass ?? this.cfg.deviceClass;
    return normalizeDeviceClass(raw);
  }

  _addrForTag(tag, deviceClass) {
    const a = tag.driverAddress?.deviceAddr ?? tag.driverAddress?.slaveId ?? this.cfg.deviceAddr ?? this.cfg.slaveId;
    if (a != null && Number.isFinite(Number(a))) return Number(a);
    return defaultAddr(deviceClass || this._deviceClassForTag(tag));
  }

  _timeoutMs() {
    return Math.min(Math.max(Number(this.cfg.timeoutMs) || 1500, 200), 5000);
  }

  _frameDelayMs() {
    return Math.max(Number(this.cfg.frameDelayMs) || 30, 10);
  }

  _busGapMs() {
    return Math.max(Number(this.cfg.busGapMs) || 120, 50);
  }

  _pointForTag(tag) {
    return tag.driverAddress?.jandy || tag.driverAddress?.point || '';
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
        baudRate: c.baud || 9600,
        dataBits: 8,
        parity: this._parity(c.parity),
        stopBits: c.stopBits || 1,
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

  async _readResponse(expectCmd, timeoutMs) {
    const buf = await new Promise((resolve, reject) => {
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
        const frame = findFrame(merged);
        if (frame.ok && (!expectCmd || frame.cmd === expectCmd)) {
          finish(null, merged);
        } else if (total > 256) {
          finish(null, merged);
        }
      };
      timer = setTimeout(() => finish(new Error(`Jandy timeout after ${timeoutMs}ms`)), timeoutMs);
      this.port.on('data', onData);
      this.port.on('error', onErr);
    });
    return buf;
  }

  async _exchange(request, expectCmd) {
    if (!this.port?.isOpen) throw new Error('serial port not open');
    await new Promise((resolve, reject) => {
      this.port.write(request, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      this.port.drain((err) => (err ? reject(err) : resolve()));
    });
    await sleep(this._frameDelayMs());
    return this._readResponse(expectCmd, this._timeoutMs());
  }

  async _pollDevice(deviceAddr, deviceClass) {
    const req = buildStatusRequest(deviceAddr, deviceClass);
    const expectCmd = expectedResponseCmd(deviceClass);
    const rsp = await this._exchange(req, expectCmd);
    const parsed = parseStatusResponse(rsp, deviceAddr, deviceClass);
    if (!parsed.ok) this._lastError = parsed.error || 'status parse failed';
    return parsed;
  }

  _groupTags(tags) {
    const groups = new Map();
    for (const t of tags) {
      const dc = this._deviceClassForTag(t);
      const addr = this._addrForTag(t, dc);
      const key = groupKey(dc, addr);
      if (!groups.has(key)) groups.set(key, { deviceClass: dc, deviceAddr: addr, tags: [] });
      groups.get(key).tags.push(t);
    }
    return groups;
  }

  _ctxForGroup(deviceClass, status) {
    const dc = normalizeDeviceClass(deviceClass);
    return {
      epump: dc === DEVICE_CLASS.EPUMP ? status : null,
      aquapure: dc === DEVICE_CLASS.AQUAPURE ? status : null,
      heater: (dc === DEVICE_CLASS.JXI_HEATER || dc === DEVICE_CLASS.LX_HEATER || dc === DEVICE_CLASS.HEAT_PUMP)
        ? status : null,
    };
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    if (shouldSkipFieldbusPoll(this, this.cfg)) return;
    await this._enqueue(async () => {
      try {
        const groups = this._groupTags(tags);
        for (const { deviceClass, deviceAddr, tags: groupTags } of groups.values()) {
          const status = await this._pollDevice(deviceAddr, deviceClass);
          this._cache.set(groupKey(deviceClass, deviceAddr), status);
          const ctx = this._ctxForGroup(deviceClass, status);
          for (const t of groupTags) {
            const point = this._pointForTag(t);
            const raw = pointValue(point, ctx);
            if (raw == null) continue;
            const val = t.type === 'BOOL' ? !!raw : (t.type === 'INT' ? Math.round(Number(raw)) : Number(raw));
            store.setValue(t.id, val, status.ok ? QUALITY.GOOD : QUALITY.BAD);
          }
          await sleep(this._busGapMs());
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
        for (const { deviceClass, deviceAddr, tags: groupTags } of byGroup.values()) {
          const dc = normalizeDeviceClass(deviceClass);
          if (dc === DEVICE_CLASS.EPUMP) {
            let rpm = null;
            let watts = null;
            let run = null;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              const v = store.get(t.id)?.value;
              if (point === 'rpm_cmd') rpm = Math.round(Number(v) || 0);
              if (point === 'watts_cmd') watts = Math.round(Number(v) || 0);
              if (point === 'run_cmd') run = !!v;
            }
            if (run === false) rpm = 0;
            if (rpm != null) {
              await this._exchange(frameEpumpRpm(deviceAddr, rpm), expectedResponseCmd(dc));
              await sleep(this._busGapMs());
            } else if (watts != null) {
              await this._exchange(frameEpumpWatts(deviceAddr, watts), expectedResponseCmd(dc));
              await sleep(this._busGapMs());
            }
            continue;
          }
          if (dc === DEVICE_CLASS.AQUAPURE) {
            let percent = null;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              if (point === 'percent_cmd') percent = Math.round(Number(store.get(t.id)?.value) || 0);
            }
            if (percent == null) continue;
            await this._exchange(frameAquapurePercent(deviceAddr, percent), null);
            await sleep(this._busGapMs());
          }
        }
      } catch (e) {
        this._lastError = e.message || String(e);
      }
    });
  }
}

module.exports = { JandyDriver };
