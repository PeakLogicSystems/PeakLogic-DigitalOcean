'use strict';

const { QUALITY } = require('../tags/constants');
const { shouldSkipFieldbusPoll, markFieldbusPolled } = require('./fieldbusPoll');
const {
  FC,
  MOTOR_STATUS,
  SENSOR_POINTS,
  RESPONSE_LEN,
  frameGo,
  frameStop,
  frameStatus,
  frameSetDemandRpm,
  frameReadSensor,
  parseStatus,
  parseSensor,
  parseSetDemand,
  parseSimpleAck,
} = require('./vgreenEpcProtocol');

let SerialPort = null;
try {
  ({ SerialPort } = require('serialport'));
} catch {
  SerialPort = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class VgreenDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.port = null;
    this.connected = false;
    this._lastError = '';
    this._ioChain = Promise.resolve();
    this._lastDemandRpm = null;
    this._runWanted = false;
  }

  health() {
    if (!SerialPort) return 'serialport module unavailable';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _parity(p) {
    const map = { none: 'none', even: 'even', odd: 'odd' };
    return map[String(p || 'none').toLowerCase()] || 'none';
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

  _slaveForTag(tag) {
    const s = tag.driverAddress?.slaveId ?? this.cfg.slaveId ?? 21;
    return Number.isFinite(Number(s)) ? Number(s) : 21;
  }

  _timeoutMs() {
    return Math.min(Math.max(Number(this.cfg.timeoutMs) || 1500, 200), 5000);
  }

  _enqueue(fn) {
    const run = this._ioChain.then(fn, fn);
    this._ioChain = run.catch(() => {});
    return run;
  }

  async _exchange(request, fc, slave) {
    if (!this.port?.isOpen) throw new Error('serial port not open');
    const expectLen = RESPONSE_LEN[fc] || 9;
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
        if (total >= expectLen) {
          finish(null, Buffer.concat(chunks, total).subarray(0, expectLen));
        }
      };
      timer = setTimeout(() => finish(new Error(`VGreen timeout after ${this._timeoutMs()}ms`)), this._timeoutMs());
      this.port.on('data', onData);
      this.port.on('error', onErr);
      this.port.write(request, (err) => {
        if (err) finish(err);
      });
      this.port.drain((err) => {
        if (err) finish(err);
      });
    });
    return buf;
  }

  async _go(slave) {
    const rsp = await this._exchange(frameGo(slave), FC.GO, slave);
    return parseSimpleAck(rsp, slave, FC.GO);
  }

  async _stop(slave) {
    const rsp = await this._exchange(frameStop(slave), FC.STOP, slave);
    return parseSimpleAck(rsp, slave, FC.STOP);
  }

  async _status(slave) {
    const rsp = await this._exchange(frameStatus(slave), FC.STATUS, slave);
    return parseStatus(rsp, slave);
  }

  async _setDemandRpm(slave, rpm) {
    const rsp = await this._exchange(frameSetDemandRpm(slave, rpm), FC.SET_DEMAND, slave);
    return parseSetDemand(rsp, slave);
  }

  async _readSensor(slave, page, address, scale) {
    const rsp = await this._exchange(frameReadSensor(slave, page, address), FC.READ_SENSOR, slave);
    return parseSensor(rsp, slave, scale);
  }

  _pointForTag(tag) {
    return tag.driverAddress?.vgreen || tag.driverAddress?.point || '';
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    if (shouldSkipFieldbusPoll(this, this.cfg)) return;
    const slave = this._slaveForTag(tags[0]);
    await this._enqueue(async () => {
      for (const t of tags) {
        const point = this._pointForTag(t);
        try {
          let result;
          if (point === 'status') {
            result = await this._status(slave);
            if (result.ok) store.setValue(t.id, result.value, QUALITY.GOOD);
            else store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
            continue;
          }
          const spec = SENSOR_POINTS[point];
          if (!spec) continue;
          result = await this._readSensor(slave, spec.page, spec.address, spec.scale);
          if (result.ok) {
            const val = t.type === 'INT' ? Math.round(result.value) : Number(result.value);
            store.setValue(t.id, val, QUALITY.GOOD);
          } else {
            store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
            this._lastError = result.error || 'read failed';
          }
        } catch (e) {
          this._lastError = e.message || String(e);
          store.setValue(t.id, store.get(t.id)?.value ?? 0, QUALITY.BAD);
        }
      }
      if (this._runWanted) {
        try {
          await this._go(slave);
        } catch (e) {
          this._lastError = e.message || String(e);
        }
      }
      markFieldbusPolled(this);
    });
  }

  async writeBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    const slave = this._slaveForTag(tags[0]);
    let runCmd = null;
    let rpmCmd = null;
    for (const t of tags) {
      const point = this._pointForTag(t);
      const v = store.get(t.id)?.value;
      if (point === 'run') runCmd = !!v;
      if (point === 'rpm_cmd') rpmCmd = Math.round(Number(v) || 0);
    }
    await this._enqueue(async () => {
      try {
        if (runCmd === false) {
          this._runWanted = false;
          this._lastDemandRpm = null;
          const stop = await this._stop(slave);
          if (!stop.ok) this._lastError = stop.error || 'stop failed';
          return;
        }
        if (rpmCmd != null && rpmCmd > 0) {
          const clamped = Math.max(600, Math.min(3450, rpmCmd));
          if (this._lastDemandRpm !== clamped) {
            const set = await this._setDemandRpm(slave, clamped);
            if (!set.ok) {
              this._lastError = set.error || 'set_demand failed';
              return;
            }
            this._lastDemandRpm = clamped;
          }
        }
        if (runCmd === true) {
          this._runWanted = true;
          const go = await this._go(slave);
          if (!go.ok) this._lastError = go.error || 'go failed';
        }
      } catch (e) {
        this._lastError = e.message || String(e);
      }
    });
  }
}

module.exports = { VgreenDriver, MOTOR_STATUS };
