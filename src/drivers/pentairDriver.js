'use strict';

const { QUALITY } = require('../tags/constants');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('./fieldbusPoll');
const {
  CMD,
  HEAT_MODE,
  DEVICE_CLASS,
  DEFAULT_PUMP_ADDR,
  DEFAULT_HEAT_PUMP_ADDR,
  DEFAULT_CONTROLLER_ADDR,
  DEFAULT_INTELLIVALVE_ADDR,
  buildStatusRequest,
  parseStatusResponse,
  frameUltraTempCommand,
  framePumpRemoteCtl,
  framePumpRun,
  framePumpStop,
  framePumpSpeed,
  frameIcTakeover,
  frameIcGetStatus,
  frameIcGetTemp,
  frameIcSetPercent,
  frameIntelliValveRemote,
  frameIntelliValveGoto,
  parseIcResponse,
  normalizeDeviceClass,
  pointValue,
  expectedResponseCmd,
  findFrame,
  findIcFrame,
} = require('./pentairProtocol');

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

class PentairDriver {
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
    const dc = deviceClass || this._deviceClassForTag(tag);
    const a = tag.driverAddress?.deviceAddr ?? tag.driverAddress?.slaveId ?? this.cfg.deviceAddr ?? this.cfg.slaveId;
    if (a != null && Number.isFinite(Number(a))) return Number(a);
    if (dc === DEVICE_CLASS.INTELLIFLO) return DEFAULT_PUMP_ADDR;
    if (dc === DEVICE_CLASS.VALVE) return DEFAULT_CONTROLLER_ADDR;
    if (dc === DEVICE_CLASS.INTELLIVALVE) return DEFAULT_INTELLIVALVE_ADDR;
    return DEFAULT_HEAT_PUMP_ADDR;
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
    return tag.driverAddress?.pentair || tag.driverAddress?.point || '';
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

  async _readResponse(expectCmd, timeoutMs, protocol = 'pentair') {
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
        if (protocol === 'ic') {
          const frame = findIcFrame(merged);
          if (frame.ok) finish(null, merged);
          else if (total > 128) finish(null, merged);
          return;
        }
        const frame = findFrame(merged);
        if (frame.ok && (!expectCmd || frame.cmd === expectCmd)) {
          finish(null, merged);
        } else if (total > 128) {
          finish(null, merged);
        }
      };
      timer = setTimeout(() => finish(new Error(`Pentair timeout after ${timeoutMs}ms`)), timeoutMs);
      this.port.on('data', onData);
      this.port.on('error', onErr);
    });
    return buf;
  }

  async _exchange(request, expectCmd, protocol = 'pentair') {
    if (!this.port?.isOpen) throw new Error('serial port not open');
    await new Promise((resolve, reject) => {
      this.port.write(request, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      this.port.drain((err) => (err ? reject(err) : resolve()));
    });
    await sleep(this._frameDelayMs());
    return this._readResponse(expectCmd, this._timeoutMs(), protocol);
  }

  async _pollPentairDevice(deviceAddr, deviceClass) {
    const req = buildStatusRequest(deviceAddr, deviceClass);
    const expectCmd = expectedResponseCmd(deviceClass);
    const rsp = await this._exchange(req, expectCmd, 'pentair');
    const parsed = parseStatusResponse(rsp, deviceAddr, deviceClass);
    if (!parsed.ok) this._lastError = parsed.error || 'status parse failed';
    return parsed;
  }

  async _pollIntellichlor() {
    await this._exchange(frameIcTakeover(), null, 'ic');
    await sleep(this._busGapMs());
    await this._exchange(frameIcGetTemp(), null, 'ic');
    await sleep(this._busGapMs());
    const rsp = await this._exchange(frameIcGetStatus(), null, 'ic');
    const parsed = parseIcResponse(rsp);
    if (!parsed.ok) this._lastError = parsed.error || 'IC parse failed';
    return parsed;
  }

  async _setUltraTempMode(deviceAddr, mode, offset = 0) {
    const req = frameUltraTempCommand(deviceAddr, mode & 0xff, offset & 0xff);
    const rsp = await this._exchange(req, CMD.ULTRATEMP_STATUS, 'pentair');
    return parseStatusResponse(rsp, deviceAddr, DEVICE_CLASS.HEAT_PUMP_ULTRATEMP);
  }

  _groupTags(tags) {
    const groups = new Map();
    for (const t of tags) {
      const dc = this._deviceClassForTag(t);
      const addr = this._addrForTag(t, dc);
      const key = groupKey(dc, dc === DEVICE_CLASS.INTELLICHLOR ? 0 : addr);
      if (!groups.has(key)) groups.set(key, { deviceClass: dc, deviceAddr: addr, tags: [] });
      groups.get(key).tags.push(t);
    }
    return groups;
  }

  _ctxForGroup(deviceClass, status) {
    const dc = normalizeDeviceClass(deviceClass);
    return {
      pump: dc === DEVICE_CLASS.INTELLIFLO ? status : null,
      ultratemp: dc === DEVICE_CLASS.HEAT_PUMP_ULTRATEMP ? status : null,
      mastertemp: dc === DEVICE_CLASS.HEAT_PUMP_MASTERTEMP ? status : null,
      ic: dc === DEVICE_CLASS.INTELLICHLOR ? status : null,
      valves: dc === DEVICE_CLASS.VALVE ? status : null,
      intellivalve: dc === DEVICE_CLASS.INTELLIVALVE ? status : null,
    };
  }

  _valveCacheKey(deviceAddr) {
    return `intellivalve:${Number(deviceAddr)}`;
  }

  async _ensureIntelliValveRemote(deviceAddr) {
    const key = this._valveCacheKey(deviceAddr);
    const cached = this._cache.get(key) || {};
    if (cached.remoteOk) return;
    await this._exchange(frameIntelliValveRemote(deviceAddr, true), null, 'pentair');
    await sleep(this._busGapMs());
    this._cache.set(key, { ...cached, remoteOk: true });
  }

  async _setIntelliValvePosition(deviceAddr, mode) {
    await this._ensureIntelliValveRemote(deviceAddr);
    const cmd = Math.round(Number(mode) || 0);
    const key = this._valveCacheKey(deviceAddr);
    const cached = this._cache.get(key) || {};
    if (cached.lastCmd === cmd && cached.pending) return;
    await this._exchange(frameIntelliValveGoto(deviceAddr, cmd), null, 'pentair');
    await sleep(this._busGapMs());
    this._cache.set(key, { ...cached, remoteOk: true, lastCmd: cmd, pending: true, atPos: false });
  }

  _intelliValveAtPos(status, deviceAddr) {
    const key = this._valveCacheKey(deviceAddr);
    const cached = this._cache.get(key) || {};
    if (!status?.ok) return false;
    if (status.notMoving) {
      this._cache.set(key, { ...cached, pending: false, atPos: true, position: status.position });
      return true;
    }
    this._cache.set(key, { ...cached, pending: true, atPos: false, position: status.position });
    return false;
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    if (shouldSkipFieldbusPoll(this, this.cfg)) return;
    await this._enqueue(async () => {
      try {
        const groups = this._groupTags(tags);
        for (const { deviceClass, deviceAddr, tags: groupTags } of groups.values()) {
          const dc = normalizeDeviceClass(deviceClass);
          let status;
          if (dc === DEVICE_CLASS.INTELLICHLOR) {
            status = await this._pollIntellichlor();
          } else {
            status = await this._pollPentairDevice(deviceAddr, dc);
          }
          if (dc === DEVICE_CLASS.INTELLIVALVE) {
            const atPos = this._intelliValveAtPos(status, deviceAddr);
            status = { ...status, atPos };
          }
          this._cache.set(groupKey(dc, deviceAddr), status);
          const ctx = this._ctxForGroup(dc, status);
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
          if (dc === DEVICE_CLASS.INTELLICHLOR) {
            let percent = null;
            let takeover = false;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              const v = store.get(t.id)?.value;
              if (point === 'ic_percent_cmd') percent = Math.round(Number(v) || 0);
              if (point === 'ic_takeover_cmd') takeover = !!v;
            }
            if (takeover) {
              await this._exchange(frameIcTakeover(), null, 'ic');
              await sleep(this._busGapMs());
            }
            if (percent != null) {
              await this._exchange(frameIcSetPercent(percent), null, 'ic');
              await sleep(this._busGapMs());
            }
            continue;
          }

          if (dc === DEVICE_CLASS.HEAT_PUMP_ULTRATEMP) {
            let modeCmd = null;
            let runCmd = null;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              const v = store.get(t.id)?.value;
              if (point === 'mode_cmd') modeCmd = Math.round(Number(v) || 0);
              if (point === 'run_cmd') runCmd = !!v;
            }
            if (runCmd === false) modeCmd = HEAT_MODE.OFF;
            else if (runCmd === true && modeCmd == null) modeCmd = HEAT_MODE.HEAT;
            if (modeCmd == null) continue;
            const clamped = Math.max(0, Math.min(2, modeCmd));
            const cache = this._cache.get(groupKey(dc, deviceAddr));
            const offset = cache?.offsetTemp || 0;
            const result = await this._setUltraTempMode(deviceAddr, clamped, offset);
            if (result.ok) this._cache.set(groupKey(dc, deviceAddr), result);
            else this._lastError = result.error || 'mode write failed';
            await sleep(this._busGapMs());
            continue;
          }

          if (dc === DEVICE_CLASS.INTELLIFLO) {
            let rpm = null;
            let run = null;
            let remote = null;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              const v = store.get(t.id)?.value;
              if (point === 'rpm_cmd') rpm = Math.round(Number(v) || 0);
              if (point === 'run_cmd') run = !!v;
              if (point === 'remote_cmd') remote = !!v;
            }
            if (remote === true) {
              await this._exchange(framePumpRemoteCtl(deviceAddr, true), null, 'pentair');
              await sleep(this._busGapMs());
            }
            if (run === true) {
              await this._exchange(framePumpRun(deviceAddr), null, 'pentair');
              await sleep(this._busGapMs());
            } else if (run === false) {
              await this._exchange(framePumpStop(deviceAddr), null, 'pentair');
              await sleep(this._busGapMs());
            }
            if (rpm != null && rpm > 0) {
              await this._exchange(framePumpSpeed(deviceAddr, rpm), null, 'pentair');
              await sleep(this._busGapMs());
            }
            continue;
          }

          if (dc === DEVICE_CLASS.INTELLIVALVE) {
            let posCmd = null;
            for (const t of groupTags) {
              const point = this._pointForTag(t);
              if (point === 'pos_cmd') posCmd = Math.round(Number(store.get(t.id)?.value) || 0);
            }
            if (posCmd == null) continue;
            await this._setIntelliValvePosition(deviceAddr, posCmd);
          }
        }
      } catch (e) {
        this._lastError = e.message || String(e);
      }
    });
  }
}

module.exports = { PentairDriver, HEAT_MODE };
