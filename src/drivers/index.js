'use strict';

const { MockDriver } = require('./mockDriver');
const { ModbusDriver } = require('./modbusDriver');
const { MqttDriver } = require('./mqttDriver');
const { HttpsDriver } = require('./httpsDriver');
const { OptaRemoteDriver } = require('./optaRemoteDriver');
const { MqttFleetOptaDriver } = require('./mqttFleetOptaDriver');
const { SerialDriver } = require('./serialDriver');
const { NativeSoDriver } = require('./nativeSoDriver');
const { HalDriver } = require('./halDriver');
const { ModbusBridgeDriver } = require('./modbusBridge');
const persistence = require('../persistence');
const { resolveSerialPort } = require('../system/serialPortResolve');

const WIN32_COM_RELEASE_MS = 300;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const FACTORIES = {
  mock: (cfg) => new MockDriver(cfg),
  modbus_rtu: (cfg) => new ModbusDriver(cfg),
  modbus_tcp: (cfg) => new ModbusDriver(cfg),
  modbus_bridge: (cfg) => new ModbusBridgeDriver(cfg),
  mqtt: (cfg) => new MqttDriver(cfg),
  https: (cfg) => new HttpsDriver(cfg),
  opta_remote: (cfg) => new OptaRemoteDriver(cfg),
  mqtt_fleet: (cfg) => new MqttFleetOptaDriver(cfg),
  serial: (cfg) => new SerialDriver(cfg),
  native_so: (cfg) => new NativeSoDriver(cfg),
  hal: (cfg) => new HalDriver(cfg),
};

class DriverManager {
  constructor(tagStore) {
    this.tagStore = tagStore;
    this.configs = persistence.readJson('drivers.json', []);
    this.instances = new Map();
  }

  list() {
    return this.configs;
  }

  save(configs) {
    this.configs = configs;
    persistence.writeJson('drivers.json', configs);
  }

  _rtuConfiguredPorts(skipDriverId) {
    const reserved = [];
    for (const c of this.configs) {
      if (!c.enabled || c.id === skipDriverId) continue;
      if (c.type === 'modbus_rtu' && c.serialPort) {
        reserved.push(c.serialPort);
      } else if (c.type === 'modbus_bridge' && c.rtu?.serialPort) {
        reserved.push(c.rtu.serialPort);
      }
    }
    return reserved;
  }

  _liveRtuPorts(skipDriverId) {
    const ports = [];
    for (const [id, inst] of this.instances) {
      if (id === skipDriverId || !inst?.connected) continue;
      const cfg = this.configs.find((c) => c.id === id);
      const p = inst._serialPortResolved?.path
        || (cfg?.type === 'modbus_bridge' ? cfg.rtu?.serialPort : cfg?.serialPort);
      if (p) ports.push(p);
    }
    return ports;
  }

  async _prepareRtuConnect(cfg, rtuPortsInUse = new Map()) {
    const exclude = [
      ...this._rtuConfiguredPorts(cfg.id),
      ...rtuPortsInUse.keys(),
    ];
    const resolved = await resolveSerialPort(cfg.serialPort, { exclude });
    const connectCfg = resolved.path !== cfg.serialPort
      ? { ...cfg, serialPort: resolved.path }
      : cfg;
    return { connectCfg, resolved };
  }

  _connectCfg(cfg) {
    if (cfg.type === 'mqtt') {
      const topics = new Set(cfg.subscriptions || []);
      for (const t of this.mappingsFor(cfg.id)) {
        const topic = t.driverAddress?.topic;
        if (topic) topics.add(topic);
      }
      return {
        ...cfg,
        brokerUrl: cfg.brokerUrl || cfg.broker,
        subscriptions: [...topics],
      };
    }
    if (cfg.type === 'https') {
      return {
        ...cfg,
        baseUrl: cfg.baseUrl || cfg.url,
      };
    }
    if (cfg.type === 'opta_remote' || cfg.type === 'mqtt_fleet') {
      const settings = persistence.readJson('settings.json', {});
      return { ...cfg, remoteExecution: settings.remoteExecution === true };
    }
    return cfg;
  }

  async connectDriver(id) {
    const cfg = this.configs.find((c) => c.id === id);
    if (!cfg || cfg.enabled === false) {
      throw new Error(`Driver "${id}" not found or disabled`);
    }
    const factory = FACTORIES[cfg.type];
    if (!factory) throw new Error(`Unknown driver type ${cfg.type}`);
    const existing = this.instances.get(id);
    if (existing?.connected) return true;
    if (existing) {
      try { await existing.disconnect(); } catch { /* ignore */ }
      this.instances.delete(id);
    }
    const inst = factory(cfg);
    this.instances.set(id, inst);
    let connectCfg = this._connectCfg(cfg);
    if (cfg.type === 'modbus_rtu') {
      const { connectCfg: cc, resolved } = await this._prepareRtuConnect(cfg, new Map());
      connectCfg = cc;
      inst._serialPortResolved = resolved;
    }
    try {
      const ok = await inst.connect(connectCfg);
      if (ok === false && !inst._lastError) inst._lastError = 'Connection failed';
      return !!inst.connected;
    } catch (e) {
      inst._lastError = e.message || String(e);
      inst.connected = false;
      throw e;
    }
  }

  async disconnectDriver(id) {
    const inst = this.instances.get(id);
    if (!inst) return;
    try { await inst.disconnect(); } catch { /* ignore */ }
    this.instances.delete(id);
  }

  async rebuild() {
    const hadRtu = this.configs.some(
      (c) => (c.type === 'modbus_rtu' || c.type === 'modbus_bridge') && this.instances.has(c.id)
    );
    for (const d of this.instances.values()) {
      try { await d.disconnect(); } catch { /* ignore */ }
    }
    this.instances.clear();
    if (hadRtu && process.platform === 'win32') {
      await sleep(WIN32_COM_RELEASE_MS);
    }
    const rtuPortsInUse = new Map();

    for (const cfg of this.configs) {
      if (!cfg.enabled) continue;
      const factory = FACTORIES[cfg.type];
      if (!factory) continue;
      const inst = factory(cfg);
      this.instances.set(cfg.id, inst);
      let connectCfg = this._connectCfg(cfg);

      if (cfg.type === 'modbus_rtu') {
        const { connectCfg: cc, resolved } = await this._prepareRtuConnect(cfg, rtuPortsInUse);
        connectCfg = cc;
        inst._serialPortResolved = resolved;
        const port = cc.serialPort;
        if (rtuPortsInUse.has(port)) {
          inst._lastError = `COM busy: ${port} already used by driver "${rtuPortsInUse.get(port)}" — disable the duplicate driver`;
          inst.connected = false;
          continue;
        }
        rtuPortsInUse.set(port, cfg.id);
      } else if (cfg.type === 'modbus_bridge' && cfg.rtu?.serialPort) {
        const exclude = [
          ...this._rtuConfiguredPorts(cfg.id),
          ...rtuPortsInUse.keys(),
        ];
        const resolved = await resolveSerialPort(cfg.rtu.serialPort, { exclude });
        inst._serialPortResolved = resolved;
        const port = resolved.path;
        if (rtuPortsInUse.has(port)) {
          inst._lastError = `COM busy: ${port} already used by driver "${rtuPortsInUse.get(port)}"`;
          inst.connected = false;
          continue;
        }
        rtuPortsInUse.set(port, cfg.id);
        if (resolved.path !== cfg.rtu.serialPort) {
          connectCfg = { ...cfg, rtu: { ...cfg.rtu, serialPort: resolved.path } };
        }
      }

      try {
        const ok = await inst.connect(connectCfg);
        if (ok === false && !inst._lastError) {
          inst._lastError = 'Connection failed';
        }
        if (inst.connected && inst._serialPortResolved?.fallback) {
          inst._lastError = '';
          inst._portNote = inst._serialPortResolved.reason;
        }
      } catch (e) {
        inst._lastError = e.message || String(e);
        inst.connected = false;
      }
    }
  }

  health() {
    return this.configs.map((c) => {
      const inst = this.instances.get(c.id);
      const configuredPort = c.type === 'modbus_bridge'
        ? (c.rtu?.serialPort || '')
        : (c.serialPort || '');
      const activePort = inst?._serialPortResolved?.path
        || (c.type === 'modbus_bridge' ? c.rtu?.serialPort : c.serialPort)
        || '';
      const portFallback = !!(inst?._serialPortResolved?.fallback);
      const connected = inst?.connected ?? false;
      let message = '';
      if (!connected) {
        message = inst?._lastError || (typeof inst?.health === 'function' ? inst.health() : '') || '';
        if (message === 'OK') message = '';
      }
      const row = {
        id: c.id,
        type: c.type,
        connected,
        configuredPort,
        activePort,
        serialPort: activePort,
        portFallback,
        portNote: connected && portFallback ? (inst?._portNote || '') : '',
        message,
      };
      if (c.type === 'hal' && typeof inst?.getStatus === 'function') {
        row.hal = inst.getStatus();
      }
      return row;
    });
  }

  halStatus() {
    const { nativeAvailable } = require('../hal/nativeBackend');
    const drivers = this.configs
      .filter((c) => c.type === 'hal')
      .map((c) => {
        const inst = this.instances.get(c.id);
        return {
          id: c.id,
          config: c,
          status: inst?.getStatus?.() || null,
          health: this.health().find((h) => h.id === c.id),
        };
      });
    return { nativeAvailable: nativeAvailable(), drivers };
  }

  hasConnectedRtu() {
    for (const [id, inst] of this.instances) {
      const cfg = this.configs.find((c) => c.id === id);
      if (cfg?.type === 'modbus_rtu' && cfg.enabled && inst?.connected) return true;
    }
    return false;
  }

  mappingsFor(driverId) {
    return this.tagStore.list().filter((t) => t.driverId === driverId && t.driverAddress);
  }

  async readAll() {
    for (const [id, driver] of this.instances) {
      const maps = this.mappingsFor(id).filter(
        (t) => (t.role === 'input' || t.role === 'memory') && !this.tagStore.isDriverReadSkipped(t)
      );
      try {
        await driver.readBatch(maps, this.tagStore);
      } catch (e) {
        driver._lastError = e.message;
      }
    }
  }

  async writeAll() {
    for (const [id, driver] of this.instances) {
      const maps = this.mappingsFor(id).filter((t) => t.dirty && t.role === 'output');
      if (!maps.length) continue;
      try {
        await driver.writeBatch(maps, this.tagStore);
      } catch (e) {
        driver._lastError = e.message;
      }
    }
    this.tagStore.clearDirty();
  }

  async testConnection(cfg) {
    const factory = FACTORIES[cfg.type];
    if (!factory) throw new Error(`Unknown driver type ${cfg.type}`);
    const live = cfg.id ? this.instances.get(cfg.id) : null;
    let liveConnectCfg = null;
    if (live) {
      try { await live.disconnect(); } catch { /* ignore */ }
      if (cfg.type === 'modbus_rtu' && process.platform === 'win32') {
        await sleep(WIN32_COM_RELEASE_MS);
      }
    }
    let connectCfg = this._connectCfg(cfg);
    if (cfg.type === 'modbus_rtu') {
      const exclude = [
        ...this._rtuConfiguredPorts(cfg.id),
        ...this._liveRtuPorts(cfg.id),
      ];
      const resolved = await resolveSerialPort(cfg.serialPort, { exclude });
      connectCfg = resolved.path !== cfg.serialPort
        ? { ...cfg, serialPort: resolved.path }
        : cfg;
      liveConnectCfg = connectCfg;
    }
    const inst = factory(connectCfg);
    try {
      const ok = await inst.connect(connectCfg);
      if (ok === false) {
        throw new Error(inst._lastError || 'Connection failed');
      }
      const h = inst.health();
      await inst.disconnect();
      if (process.platform === 'win32') await sleep(WIN32_COM_RELEASE_MS);
      return h;
    } catch (e) {
      try { await inst.disconnect(); } catch { /* ignore */ }
      throw e;
    } finally {
      if (live) {
        try {
          const ok = await live.connect(liveConnectCfg || undefined);
          if (ok === false && !live._lastError) live._lastError = 'Connection failed';
        } catch (err) {
          live._lastError = err.message || String(err);
          live.connected = false;
        }
      }
    }
  }
}

module.exports = { DriverManager };
