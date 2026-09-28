'use strict';

const { MockDriver } = require('./mockDriver');
const { ModbusDriver } = require('./modbusDriver');
const { MqttDriver } = require('./mqttDriver');
const { HttpsDriver } = require('./httpsDriver');
const { MqttParcOptaDriver } = require('./mqttParcOptaDriver');
const { SerialDriver } = require('./serialDriver');
const { NativeSoDriver } = require('./nativeSoDriver');
const { HalDriver } = require('./halDriver');
const { ModbusBridgeDriver } = require('./modbusBridge');
const { VgreenDriver } = require('./vgreenDriver');
const { PentairDriver } = require('./pentairDriver');
const { JandyDriver } = require('./jandyDriver');
const { HaywardDriver } = require('./haywardDriver');
const { NextcenturyDriver } = require('./nextcenturyDriver');
const { sanitizeDriverConfig } = require('./driverConfig');
const persistence = require('../persistence');
const { resolveSerialPort } = require('../system/serialPortResolve');
const { registry } = require('../parc/deviceRegistry');
const { getMqttCentralHub } = require('../parc/mqttCentralHub');

const WIN32_COM_RELEASE_MS = 300;

const DEFERRED_CONNECT_TYPES = new Set(['nextcentury', 'https', 'mqtt']);

/** Local field I/O polled on PC even when ST runs on Opta (remote execution). */
const FIELDBUS_DRIVER_TYPES = new Set([
  'modbus_rtu', 'modbus_tcp', 'vgreen_epc', 'pentair_rs485', 'jandy_rs485', 'hayward_rs485',
  'serial', 'hal', 'native_so',
]);

/**
 * Cloud/API drivers hosted on the PC (not the Opta). These must be polled on the
 * PC even when ST executes remotely on the Opta, otherwise their data (e.g.
 * NextCentury meters/leaks) only refreshes once at startup and then goes stale.
 * Each of these driver's readBatch self-throttles, so ticking it every scan is cheap.
 */
const HOST_API_DRIVER_TYPES = new Set(['nextcentury', 'https', 'mqtt']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function testConnectionTimeoutMs(type) {
  if (type === 'mqtt_parc') return 25000;
  // NextCentury test-execute runs the full report (per-property delay + network),
  // so it needs a larger budget than a simple connect.
  if (type === 'nextcentury') return 60000;
  if (type === 'modbus_rtu' || type === 'vgreen_epc' || type === 'pentair_rs485'
      || type === 'jandy_rs485' || type === 'hayward_rs485' || type === 'modbus_bridge' || type === 'serial') {
    return 12000;
  }
  return 20000;
}

/** Fix drivers saved as modbus when tags use NextCentury deviceId/field addressing. */
function migrateDriverConfigs(configs, tagStore) {
  const tags = tagStore?.list?.() || [];
  return (configs || []).map((cfg) => {
    const ncTagged = tags.some(
      (t) => t.driverId === cfg.id
        && t.driverAddress?.deviceId != null
        && t.driverAddress?.field != null,
    );
    if (!ncTagged || cfg.type === 'nextcentury') return cfg;
    return {
      id: cfg.id,
      type: 'nextcentury',
      enabled: cfg.enabled !== false,
      email: cfg.email || '',
      password: cfg.password || '',
      reportId: cfg.reportId || 'rt_4510',
      pollIntervalMs: cfg.pollIntervalMs || 900000,
      propertyIds: cfg.propertyIds,
      propertyDelayMs: cfg.propertyDelayMs || 600,
      autoSyncTags: cfg.autoSyncTags !== false,
      timeoutMs: cfg.timeoutMs || 20000,
    };
  });
}

function normalizeRemoteDriverCfg(cfg) {
  if (cfg.type === 'opta_remote') {
    return {
      ...cfg,
      type: 'mqtt_parc',
      deviceId: cfg.deviceId || cfg.id,
    };
  }
  return cfg;
}

const FACTORIES = {
  mock: (cfg) => new MockDriver(cfg),
  modbus_rtu: (cfg) => new ModbusDriver(cfg),
  modbus_tcp: (cfg) => new ModbusDriver(cfg),
  modbus_bridge: (cfg) => new ModbusBridgeDriver(cfg),
  vgreen_epc: (cfg) => new VgreenDriver(cfg),
  pentair_rs485: (cfg) => new PentairDriver(cfg),
  jandy_rs485: (cfg) => new JandyDriver(cfg),
  hayward_rs485: (cfg) => new HaywardDriver(cfg),
  mqtt: (cfg) => new MqttDriver(cfg),
  https: (cfg) => new HttpsDriver(cfg),
  nextcentury: (cfg) => new NextcenturyDriver(cfg),
  opta_remote: (cfg) => new MqttParcOptaDriver(normalizeRemoteDriverCfg(cfg)),
  mqtt_parc: (cfg) => new MqttParcOptaDriver(cfg),
  serial: (cfg) => new SerialDriver(cfg),
  native_so: (cfg) => new NativeSoDriver(cfg),
  hal: (cfg) => new HalDriver(cfg),
};

class DriverManager {
  constructor(tagStore) {
    this.tagStore = tagStore;
    const raw = persistence.readJson('drivers.json', []) || [];
    const migrated = migrateDriverConfigs(raw, tagStore);
    const changed = migrated.some((c, i) => JSON.stringify(c) !== JSON.stringify(raw[i]));
    this.configs = migrated
      .map(normalizeRemoteDriverCfg)
      .map(sanitizeDriverConfig);
    if (changed) persistence.writeJson('drivers.json', this.configs);
    this.instances = new Map();
  }

  list() {
    return this.configs;
  }

  save(configs) {
    this.configs = (configs || []).map((c) => sanitizeDriverConfig(normalizeRemoteDriverCfg(c)));
    persistence.writeJson('drivers.json', this.configs);
  }

  reloadFromPersistence() {
    const raw = persistence.readJson('drivers.json', []) || [];
    const migrated = migrateDriverConfigs(raw, this.tagStore);
    this.configs = migrated
      .map(normalizeRemoteDriverCfg)
      .map(sanitizeDriverConfig);
  }

  _rtuConfiguredPorts(skipDriverId) {
    const reserved = [];
    for (const c of this.configs) {
      if (!c.enabled || c.id === skipDriverId) continue;
      if (c.type === 'modbus_rtu' && c.serialPort) {
        reserved.push(c.serialPort);
      } else if (c.type === 'vgreen_epc' && c.serialPort) {
        reserved.push(c.serialPort);
      } else if (c.type === 'pentair_rs485' && c.serialPort) {
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
    if (cfg.type === 'nextcentury') {
      return {
        ...cfg,
        email: cfg.email || process.env.NEXTCENTURY_EMAIL,
        password: cfg.password || process.env.NEXTCENTURY_PASSWORD,
        pollIntervalMs: Number(cfg.pollIntervalMs) > 0 ? Number(cfg.pollIntervalMs) : 900000,
        reportId: cfg.reportId || 'rt_4510',
        autoSyncTags: cfg.autoSyncTags !== false,
      };
    }
    if (cfg.type === 'opta_remote' || cfg.type === 'mqtt_parc') {
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
    if (cfg.type === 'modbus_rtu' || cfg.type === 'vgreen_epc' || cfg.type === 'pentair_rs485') {
      const { connectCfg: cc, resolved } = await this._prepareRtuConnect(cfg, new Map());
      connectCfg = cc;
      inst._serialPortResolved = resolved;
    }
    try {
      const ok = await inst.connect(connectCfg);
      if (!inst.connected) {
        throw new Error(inst._lastError || 'Connection failed');
      }
      return true;
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

  async rebuild(opts = {}) {
    const deferApi = opts.connectDeferred === true;
    const hadRtu = this.configs.some(
      (c) => (c.type === 'modbus_rtu' || c.type === 'vgreen_epc' || c.type === 'pentair_rs485' || c.type === 'modbus_bridge') && this.instances.has(c.id)
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

      if (cfg.type === 'modbus_rtu' || cfg.type === 'vgreen_epc' || cfg.type === 'pentair_rs485') {
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
      } else if (cfg.type === 'opta_remote') {
        // Manual connect-on-demand — do not block app boot on device HTTP/MQTT.
        inst.connected = false;
        inst._lastError = '';
        continue;
      } else if (cfg.type === 'mqtt_parc') {
        // Project open / boot: do not block on runtime_status for every fleet driver.
        // Telemetry still flows via the central hub; link on scan start or manual Connect.
        if (deferApi || !getMqttCentralHub(registry).isLive()) {
          inst.connected = false;
          inst._lastError = '';
          continue;
        }
      } else if (deferApi && DEFERRED_CONNECT_TYPES.has(cfg.type)) {
        inst.connected = false;
        inst._lastError = '';
        continue;
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
    await this._bootstrapApiDrivers(deferApi);
  }

  /** Connect enabled mqtt_parc drivers when the central MQTT hub is live. */
  async linkMqttParcDriversIfHubLive() {
    if (!getMqttCentralHub(registry).isLive()) return [];
    const results = [];
    for (const cfg of this.configs) {
      if (!cfg.enabled || cfg.type !== 'mqtt_parc') continue;
      const inst = this.instances.get(cfg.id);
      if (!inst) continue;
      if (inst.connected) {
        results.push({ id: cfg.id, ok: true, skipped: true });
        continue;
      }
      const connectCfg = this._connectCfg(cfg);
      try {
        const ok = await inst.connect(connectCfg);
        if (ok === false && !inst._lastError) {
          inst._lastError = 'Connection failed';
        }
        if (inst.connected) {
          const note = inst._lastError ? ` (${inst._lastError})` : '';
          console.log(`[mqtt-parc] linked driver "${cfg.id}"${note}`);
          results.push({ id: cfg.id, ok: true });
        } else {
          const msg = inst._lastError || 'Connection failed';
          console.warn(`[mqtt-parc] driver "${cfg.id}" not linked: ${msg}`);
          results.push({ id: cfg.id, ok: false, error: msg });
        }
      } catch (e) {
        const msg = e.message || String(e);
        inst._lastError = msg;
        inst.connected = false;
        console.warn(`[mqtt-parc] driver "${cfg.id}" not linked: ${msg}`);
        results.push({ id: cfg.id, ok: false, error: msg });
      }
    }
    return results;
  }

  /** Initial API poll + tag sync for cloud drivers (NextCentury, etc.) after connect. */
  async _bootstrapApiDrivers(skipWhenDeferred = false) {
    if (skipWhenDeferred) return;
    for (const cfg of this.configs) {
      if (!cfg.enabled) continue;
      const inst = this.instances.get(cfg.id);
      if (!inst?.connected) continue;
      if (cfg.type !== 'nextcentury') continue;
      try {
        const maps = this.mappingsFor(cfg.id).filter(
          (t) => (t.role === 'input' || t.role === 'memory') && !this.tagStore.isDriverReadSkipped(t),
        );
        await inst.readBatch(maps, this.tagStore);
        const n = this.tagStore.list().filter((t) => t.driverId === cfg.id).length;
        console.log(`[nextcentury] initial poll OK — ${n} tag(s) on "${cfg.id}"`);
      } catch (e) {
        const msg = e.message || String(e);
        if (!inst._lastError) inst._lastError = msg;
        console.warn(`[nextcentury] initial poll for "${cfg.id}": ${msg}`);
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
      } else if (c.type === 'mqtt_parc' || c.type === 'opta_remote') {
        const h = typeof inst?.health === 'function' ? inst.health() : '';
        if (h && h !== 'OK') message = h;
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
      if ((cfg?.type === 'modbus_rtu' || cfg?.type === 'vgreen_epc' || cfg?.type === 'pentair_rs485') && cfg.enabled && inst?.connected) return true;
    }
    return false;
  }

  hasEnabledFieldbus() {
    return this.configs.some((c) => c.enabled && FIELDBUS_DRIVER_TYPES.has(c.type));
  }

  mappingsFor(driverId) {
    return this.tagStore.list().filter((t) => t.driverId === driverId && t.driverAddress);
  }

  _isFieldbusDriver(id) {
    const cfg = this.configs.find((c) => c.id === id);
    return !!(cfg?.enabled && FIELDBUS_DRIVER_TYPES.has(cfg.type));
  }

  _isHostApiDriver(id) {
    const cfg = this.configs.find((c) => c.id === id);
    return !!(cfg?.enabled && HOST_API_DRIVER_TYPES.has(cfg.type));
  }

  async _readDrivers(filterFn) {
    for (const [id, driver] of this.instances) {
      if (!filterFn(id)) continue;
      const maps = this.mappingsFor(id).filter(
        (t) => (t.role === 'input' || t.role === 'memory') && !this.tagStore.isDriverReadSkipped(t),
      );
      try {
        await driver.readBatch(maps, this.tagStore);
      } catch (e) {
        driver._lastError = e.message;
      }
    }
  }

  async _writeDrivers(filterFn) {
    for (const [id, driver] of this.instances) {
      if (!filterFn(id)) continue;
      const maps = this.mappingsFor(id).filter((t) => t.dirty && t.role === 'output');
      if (!maps.length) continue;
      try {
        await driver.writeBatch(maps, this.tagStore);
      } catch (e) {
        driver._lastError = e.message;
      }
    }
  }

  async readAll() {
    await this._readDrivers(() => true);
  }

  /** Poll PC-attached buses (RS-485, HAL, etc.) while ST runs on Opta. */
  async readFieldbus() {
    await this._readDrivers((id) => this._isFieldbusDriver(id));
  }

  /** Poll PC-hosted cloud/API drivers (NextCentury, HTTPS, MQTT) while ST runs on Opta. */
  async readHostApi() {
    await this._readDrivers((id) => this._isHostApiDriver(id));
  }

  async writeAll() {
    await this._writeDrivers(() => true);
    this.tagStore.clearDirty();
  }

  async writeFieldbus() {
    await this._writeDrivers((id) => this._isFieldbusDriver(id));
    this.tagStore.clearDirty();
  }

  async testConnection(cfg) {
    const type = String(cfg?.type || '').trim();
    const timeoutMs = testConnectionTimeoutMs(type);
    return withTimeout(
      this._testConnectionOnce(cfg),
      timeoutMs,
      `Driver test timed out after ${Math.round(timeoutMs / 1000)}s`,
    );
  }

  async _testConnectionOnce(cfg) {
    const type = String(cfg?.type || '').trim();
    const factory = FACTORIES[type];
    if (!factory) {
      throw new Error(
        `Unknown driver type ${type || '(missing)'}. Restart PeakLogic after upgrading; known types: ${Object.keys(FACTORIES).join(', ')}`,
      );
    }
    const savedCfg = cfg.id ? this.configs.find((c) => c.id === cfg.id) : null;
    const live = cfg.id ? this.instances.get(cfg.id) : null;
    const restoreLive = !!(live && savedCfg && savedCfg.type === type);
    let liveConnectCfg = null;
    if (live) {
      try { await live.disconnect(); } catch { /* ignore */ }
      if ((type === 'modbus_rtu' || type === 'vgreen_epc') && process.platform === 'win32') {
        await sleep(WIN32_COM_RELEASE_MS);
      }
    }
    let connectCfg = { ...this._connectCfg(cfg), testConnection: true };
    if (cfg.type === 'modbus_rtu' || cfg.type === 'vgreen_epc' || cfg.type === 'pentair_rs485') {
      const exclude = [
        ...this._rtuConfiguredPorts(cfg.id),
        ...this._liveRtuPorts(cfg.id),
      ];
      const resolved = await resolveSerialPort(cfg.serialPort, { exclude });
      connectCfg = resolved.path !== cfg.serialPort
        ? { ...connectCfg, serialPort: resolved.path }
        : connectCfg;
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
      if (restoreLive) {
        try {
          const ok = await live.connect(liveConnectCfg || this._connectCfg(savedCfg));
          if (ok === false && !live._lastError) live._lastError = 'Connection failed';
        } catch (err) {
          live._lastError = err.message || String(err);
          live.connected = false;
        }
      }
    }
  }
}

module.exports = { DriverManager, DRIVER_TYPES: Object.keys(FACTORIES) };
