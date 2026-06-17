'use strict';

const ModbusRTU = require('modbus-serial');
const { QUALITY } = require('../tags/constants');
const { scaleRawToEng, scaleEngToRaw } = require('../tags/tagAnalog');
const {
  isArrayTag,
  modbusRegSpan,
  normalizeArrayValue,
  arrayToRegisterWords,
  registersToArray,
} = require('../tags/tagArrays');

async function safeCloseClient(client) {
  if (!client) return;
  try {
    if (client.isOpen) await client.close();
  } catch {
    /* not open / already closed */
  }
}

class ModbusDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.client = new ModbusRTU();
    this.connected = false;
    this._lastError = '';
  }

  health() {
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _bindPortErrors() {
    if (!this.client._mooreviewErr) {
      this.client._mooreviewErr = true;
      this.client.on('error', (err) => {
        this._lastError = err.message || String(err);
        this.connected = false;
      });
    }
    const port = this.client?._port;
    if (!port || port._mooreviewErr) return;
    port._mooreviewErr = true;
    port.on('error', (err) => {
      this._lastError = err.message || String(err);
      this.connected = false;
    });
  }

  /** @param {object} [cfg] optional override (resolved serial port) */
  async connect(cfg) {
    const c = cfg || this.cfg;
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    this.connected = false;
    this._lastError = '';
    this.client.setTimeout(c.timeoutMs || 1000);
    try {
      if (c.type === 'modbus_tcp') {
        await this.client.connectTCP(c.host || '127.0.0.1', { port: c.port || 502 });
      } else {
        await this.client.connectRTUBuffered(c.serialPort || '/dev/ttyUSB0', {
          baudRate: c.baud || 9600,
          parity: c.parity || 'none',
          stopBits: c.stopBits || 1,
        });
      }
      this._bindPortErrors();
      const sid = c.slaveId || 1;
      this.client.setID(sid);
      this._activeSlaveId = sid;
      this.connected = true;
      return true;
    } catch (e) {
      this._lastError = e.message || String(e);
      this._bindPortErrors();
      await safeCloseClient(this.client);
      this.client = new ModbusRTU();
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    this._activeSlaveId = null;
    await safeCloseClient(this.client);
    this.client = new ModbusRTU();
  }

  _scaled(raw, tag) {
    return scaleRawToEng(raw, tag);
  }

  _combineWords(data, wordWidth, signed) {
    if (wordWidth <= 16 || data.length < 2) {
      let v = data[0];
      if (signed && v > 0x7fff) v -= 0x10000;
      return v;
    }
    let v = (data[0] << 16) | data[1];
    if (signed && v > 0x7fffffff) v -= 0x100000000;
    return v;
  }

  _decodeFloat32(data, byteOrder = 'BE') {
    if (!data || data.length < 2) return 0;
    const hi = data[0] & 0xffff;
    const lo = data[1] & 0xffff;
    const buf = Buffer.alloc(4);
    const be = String(byteOrder).toUpperCase() !== 'LE';
    if (be) {
      buf.writeUInt16BE(hi, 0);
      buf.writeUInt16BE(lo, 2);
      return buf.readFloatBE(0);
    }
    buf.writeUInt16LE(lo, 0);
    buf.writeUInt16LE(hi, 2);
    return buf.readFloatLE(0);
  }

  _rawFromWords(slice, item, tag) {
    const enc = item.tag.driverAddress?.encoding || tag.driverAddress?.encoding;
    if (enc === 'float32') {
      const order = item.tag.driverAddress?.byteOrder || tag.driverAddress?.byteOrder || 'BE';
      return this._decodeFloat32(slice, order);
    }
    return this._combineWords(slice, item.wordWidth, item.signed);
  }

  _splitWord(raw, wordWidth) {
    if (wordWidth <= 16) return [raw & 0xffff];
    return [(raw >> 16) & 0xffff, raw & 0xffff];
  }

  _slaveForTag(tag) {
    const a = tag.driverAddress || {};
    const s = a.slaveId ?? this.cfg.slaveId ?? 1;
    return Number.isFinite(Number(s)) ? Number(s) : 1;
  }

  _ensureSlaveId(slaveId) {
    const id = Number(slaveId) || 1;
    if (this._activeSlaveId !== id) {
      this.client.setID(id);
      this._activeSlaveId = id;
    }
  }

  _ioTimeoutMs() {
    return Math.min(Math.max(Number(this.cfg.timeoutMs) || 1500, 200), 5000);
  }

  async _withIoTimeout(promise, label) {
    const ms = this._ioTimeoutMs();
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  _readFnForTag(t, a) {
    if (t.type === 'BOOL') {
      return a.table === 'discrete' ? 'readDiscreteInputs' : 'readCoils';
    }
    return a.table === 'input' ? 'readInputRegisters' : 'readHoldingRegisters';
  }

  _groupReadBlocks(tags) {
    const groups = new Map();
    for (const t of tags) {
      const a = t.driverAddress || {};
      const slaveId = this._slaveForTag(t);
      const table = a.table || (t.type === 'BOOL' ? 'discrete' : 'holding');
      const fn = this._readFnForTag(t, { ...a, table });
      const wordWidth = a.wordWidth || t.wordWidth || 16;
      const regSpan = modbusRegSpan({ ...t, wordWidth, driverAddress: a });
      const key = `${slaveId}|${fn}`;
      if (!groups.has(key)) {
        groups.set(key, { slaveId, fn, table, items: [] });
      }
      groups.get(key).items.push({
        tag: t,
        address: Number(a.address) || 0,
        regSpan,
        wordWidth,
        signed: a.signed !== false && t.signed !== false,
      });
    }
    const blocks = [];
    for (const g of groups.values()) {
      g.items.sort((a, b) => a.address - b.address);
      let block = null;
      for (const item of g.items) {
        if (!block || item.address > block.end + 1 || (block.end - block.start + 1) + (item.address - block.end - 1) + item.regSpan > 125) {
          block = { slaveId: g.slaveId, fn: g.fn, start: item.address, end: item.address + item.regSpan - 1, items: [item] };
          blocks.push(block);
        } else {
          block.end = Math.max(block.end, item.address + item.regSpan - 1);
          block.items.push(item);
        }
      }
    }
    return blocks;
  }

  async readBatch(tags, store) {
    if (!this.connected || !tags.length) return;
    const blocks = this._groupReadBlocks(tags);
    for (const block of blocks) {
      this._ensureSlaveId(block.slaveId);
      const count = block.end - block.start + 1;
      try {
        const res = await this._withIoTimeout(
          this.client[block.fn](block.start, count),
          `${block.fn}@${block.start}`
        );
        for (const item of block.items) {
          const offset = item.address - block.start;
          const t = item.tag;
          if (t.type === 'BOOL') {
            store.setValue(t.id, !!res.data[offset], QUALITY.GOOD);
          } else if (isArrayTag(t)) {
            const slice = res.data.slice(offset, offset + item.regSpan);
            const scaled = registersToArray(
              { ...t, wordWidth: item.wordWidth, signed: item.signed },
              slice,
              (raw, tag) => this._scaled(raw, tag),
            );
            store.setValue(t.id, scaled, QUALITY.GOOD);
          } else {
            const slice = res.data.slice(offset, offset + item.regSpan);
            const raw = this._rawFromWords(slice, item, t);
            store.setValue(t.id, this._scaled(raw, t), QUALITY.GOOD);
          }
        }
      } catch (e) {
        this._lastError = e.message;
        for (const item of block.items) {
          store.setValue(item.tag.id, store.get(item.tag.id)?.value ?? 0, QUALITY.BAD);
        }
      }
    }
  }

  async writeBatch(tags, store) {
    if (!this.connected) return;
    for (const t of tags) {
      this._ensureSlaveId(this._slaveForTag(t));
      const a = t.driverAddress || {};
      const wordWidth = a.wordWidth || t.wordWidth || 16;
      const cur = store.get(t.id);
      const v = cur?.value;
      try {
        if (t.type === 'BOOL') {
          await this.client.writeCoil(a.address || 0, !!v);
        } else if (isArrayTag(t)) {
          const vals = normalizeArrayValue(t, v);
          const rawVals = vals.map((x) => scaleEngToRaw(Number(x), t));
          const words = arrayToRegisterWords({ ...t, wordWidth }, rawVals);
          await this._withIoTimeout(
            this.client.writeRegisters(a.address || 0, words),
            `writeRegisters@${a.address || 0}`,
          );
        } else {
          let raw = scaleEngToRaw(Number(v), t);
          const words = this._splitWord(raw, wordWidth);
          if (words.length === 1) {
            await this._withIoTimeout(
              this.client.writeRegister(a.address || 0, words[0]),
              `writeRegister@${a.address || 0}`,
            );
          } else {
            await this._withIoTimeout(
              this.client.writeRegisters(a.address || 0, words),
              `writeRegisters@${a.address || 0}`,
            );
          }
        }
      } catch (e) {
        this._lastError = e.message;
      }
    }
  }
}

module.exports = { ModbusDriver };
