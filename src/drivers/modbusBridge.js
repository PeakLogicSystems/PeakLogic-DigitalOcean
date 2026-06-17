'use strict';

const ModbusRTU = require('modbus-serial');
const { moveBlock } = require('./modbusMove');

async function safeCloseClient(client) {
  if (!client) return;
  try {
    if (client.isOpen) await client.close();
  } catch { /* ignore */ }
}

class ModbusBridgeDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._rtu = null;
    this._tcp = null;
    this._server = null;
    this._moveTimer = null;
  }

  health() {
    return this.connected ? `OK (${this.cfg.mode})` : (this._lastError || 'disconnected');
  }

  async _connectRtu() {
    const r = this.cfg.rtu || {};
    const c = new ModbusRTU();
    c.setTimeout(this.cfg.timeoutMs || 2000);
    await c.connectRTUBuffered(r.serialPort || '/dev/ttyUSB0', {
      baudRate: r.baud || 9600,
      parity: r.parity || 'none',
      stopBits: r.stopBits || 1,
    });
    c.setID(r.slaveId || 1);
    return c;
  }

  async _connectTcp() {
    const t = this.cfg.tcp || {};
    const c = new ModbusRTU();
    c.setTimeout(this.cfg.timeoutMs || 2000);
    await c.connectTCP(t.host || '127.0.0.1', { port: t.port || 502 });
    c.setID(t.slaveId || 1);
    return c;
  }

  _makeVector() {
    const rtu = this._rtu;
    const self = this;
    const proxy = async (fn, addr, len) => {
      try {
        const res = await rtu[fn](addr, len || 1);
        return res.data;
      } catch (e) {
        self._lastError = e.message;
        throw e;
      }
    };
    return {
      getCoil: (addr) => proxy('readCoils', addr, 1).then((d) => !!d[0]),
      setCoil: (addr, val) => rtu.writeCoil(addr, val),
      getDiscreteInput: (addr) => proxy('readDiscreteInputs', addr, 1).then((d) => !!d[0]),
      getInputRegister: (addr) => proxy('readInputRegisters', addr, 1).then((d) => d[0]),
      getHoldingRegister: (addr) => proxy('readHoldingRegisters', addr, 1).then((d) => d[0]),
      setRegister: (addr, val) => rtu.writeRegister(addr, val),
      setRegisterArray: (addr, vals) => rtu.writeRegisters(addr, vals),
    };
  }

  async connect() {
    const mode = this.cfg.mode || 'tcp_to_rtu';
    if (mode === 'tcp_to_rtu') {
      this._rtu = await this._connectRtu();
      const port = this.cfg.listenPort || 5020;
      this._server = new ModbusRTU.ServerTCP(this._makeVector(), {
        host: this.cfg.listenHost || '0.0.0.0',
        port,
        debug: false,
      });
      this.connected = true;
      return;
    }
    if (mode === 'rtu_to_tcp' || mode === 'move') {
      this._rtu = await this._connectRtu();
      this._tcp = await this._connectTcp();
      this.connected = true;
      if (mode === 'move') {
        const ms = this.cfg.moveIntervalMs || 1000;
        this._moveTimer = setInterval(() => this._runMove().catch((e) => {
          this._lastError = e.message;
        }), ms);
      }
      return;
    }
    throw new Error(`Unknown bridge mode ${mode}`);
  }

  async _runMove() {
    if (!this._rtu || !this._tcp) return;
    for (const map of this.cfg.moveMaps || []) {
      await moveBlock(this._rtu, this._tcp, map);
    }
  }

  async disconnect() {
    if (this._moveTimer) clearInterval(this._moveTimer);
    this._moveTimer = null;
    if (this._server) {
      try { this._server.close(); } catch { /* ignore */ }
      this._server = null;
    }
    for (const c of [this._rtu, this._tcp]) {
      await safeCloseClient(c);
    }
    this._rtu = this._tcp = null;
    this.connected = false;
  }

  async readBatch() { /* bridge has no tag mappings */ }
  async writeBatch() { /* bridge has no tag mappings */ }
}

module.exports = { ModbusBridgeDriver };
