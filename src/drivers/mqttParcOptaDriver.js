'use strict';

const { QUALITY } = require('../tags/constants');
const { resolveParcRegistry } = require('../parc/deviceRegistry');
const { getMqttCentralHub } = require('../parc/mqttCentralHub');
const { buildOptaProgramBody, slimPutProgramBodyForMqtt } = require('../parc/mqttOptaProgram');
const { expandRemoteProgramTrace } = require('../parc/remoteProgramTrace');
const { clientDeployMeta, semverCompare, buildSyncTimeBody, bcDeployCrc } = require('./optaProtocol');
const { optaBrokerHint } = require('../parc/mqttBrokerHint');
const { cmdFailureHint } = require('../parc/cmdFailureHint');
const programStore = require('../programs/programStore');
const persistence = require('../persistence');

const { resolveParcDeviceId } = require('../parc/optaSerial');
const { findRegistryDeviceForDriver } = require('../parc/parcDeviceResolve');

class MqttParcOptaDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._lastError = '';
    this._traceMap = [];
  }

  _deviceId() {
    return resolveParcDeviceId(this.cfg);
  }

  _reg() {
    return resolveParcRegistry();
  }

  _registryLookup() {
    return findRegistryDeviceForDriver(this._reg(), this.cfg);
  }

  _deviceMode() {
    const { device: dev } = this._registryLookup();
    const mode = dev?.meta?.deviceMode || dev?.deviceMode || dev?.runtime?.deviceMode || 'standalone';
    return mode === 'remote_io' ? 'remote_io' : 'standalone';
  }

  _modeMismatchHint() {
    const mode = this._deviceMode();
    if (this.cfg.remoteExecution && mode === 'remote_io') {
      return 'Opta is Remote I/O mode — disable Remote ST on PC or set device to Standalone on /setup';
    }
    if (!this.cfg.remoteExecution && mode === 'standalone') {
      const { device: dev } = this._registryLookup();
      if (dev && !dev.stale) {
        return 'Opta is Standalone — enable Remote ST or set device to Remote I/O on /setup';
      }
    }
    return '';
  }

  _hub() {
    return getMqttCentralHub(this._reg());
  }

  health() {
    const hub = this._hub();
    if (!hub.isLive()) return this._lastError || 'MQTT hub offline';
    if (!this.connected) return this._lastError || 'disconnected';
    const { device: dev } = this._registryLookup();
    if (!dev) return 'linked · awaiting telemetry';
    if (dev.stale) return 'linked · stale telemetry';
    if (this.cfg.remoteExecution && dev.runtime && dev.runtime.running === false) {
      return 'linked · ST not running (use Download & Start)';
    }
    const mismatch = this._modeMismatchHint();
    if (mismatch) return `linked · ${mismatch}`;
    if (this._lastError) return this._lastError;
    return 'OK';
  }

  _deviceOnline() {
    const { device: dev } = this._registryLookup();
    return dev && !dev.stale;
  }

  _liveTelemetry(maxAgeSec = 120) {
    const { device: dev } = this._registryLookup();
    if (!dev || dev.stale) return false;
    if (dev.ageSec != null && dev.ageSec > maxAgeSec) return false;
    return true;
  }

  _cmdFailureHint(dev) {
    const { getMqttCentralHub } = require('../parc/mqttCentralHub');
    const hub = getMqttCentralHub(this._reg());
    return cmdFailureHint(dev, {
      hubBrokerUrl: hub.status().brokerUrl,
      deviceId: this._deviceId(),
      registry: this._reg(),
      mqttHubUsername: hub.cfg?.username,
      ateccSerial: this.cfg.ateccSerial,
    });
  }

  async ensureConnected() {
    const hub = this._hub();
    if (this.connected && this._deviceOnline() && hub.isLive()) return true;
    this.connected = false;
    return this.connect(this.cfg);
  }

  async connect(cfg) {
    this.cfg = { ...this.cfg, ...(cfg || {}) };
    const deviceId = this._deviceId();
    if (!deviceId) {
      this.connected = false;
      this._lastError = 'deviceId required';
      return false;
    }
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    const hub = this._hub();
    if (!hubReady.connected) {
      this.connected = false;
      this._lastError = hubReady.error || 'MQTT Parc hub not connected';
      return false;
    }
    try {
      const attempts = this.cfg.testConnection ? 1 : 3;
      const timeoutMs = this.cfg.testConnection
        ? Math.min(10000, Number(this.cfg.commandTimeoutMs) || 10000)
        : Math.max(15000, Number(this.cfg.commandTimeoutMs) || 30000);
      let lastErr;
      for (let i = 0; i < attempts; i += 1) {
        try {
          await hub.sendCommand(deviceId, 'runtime_status', {}, { timeoutMs });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (i < attempts - 1) {
            console.warn(
              `[mqtt-parc] runtime_status connect attempt ${i + 1}/${attempts} failed for ${deviceId} (${e.message || e}) — retrying`,
            );
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
      if (lastErr) throw lastErr;
      this._reg().touchReport(deviceId);
      this.connected = true;
      this._lastError = '';
      try {
        await this.syncTime({ deviceId });
      } catch (e) {
        console.warn(`[mqtt-parc] sync_time on connect failed for ${deviceId}: ${e.message || e}`);
      }
      return true;
    } catch (e) {
      const hubOnline = hub.isLive();
      const online = this._deviceOnline();
      const isCmdTimeout = /command timeout/i.test(e.message || '');
      const telemetryOnly = !this.cfg.remoteExecution
        && this._liveTelemetry()
        && hubOnline
        && !/hub not connected/i.test(e.message || '');
      if (telemetryOnly) {
        this.connected = true;
        this._lastError = '';
        return true;
      }
      if (this._liveTelemetry() && hubOnline && isCmdTimeout) {
        const { device: dev } = this._registryLookup();
        this.connected = false;
        this._lastError = this._cmdFailureHint(dev);
        return false;
      }
      this.connected = false;
      const { device: dev } = this._registryLookup();
      if (!dev) {
        this._lastError = `Device ${deviceId} not seen on MQTT — ${optaBrokerHint().optaSetupHint}`;
      } else if (dev.stale) {
        this._lastError = `Telemetry stale for ${deviceId} (last report ${dev.ageSec ?? '?'}s ago) — power-cycle Opta or check Ethernet`;
      } else {
        this._lastError = e.message || String(e);
      }
      return false;
    }
  }

  async disconnect() {
    const deviceId = this._deviceId();
    if (this.cfg.remoteExecution && deviceId) {
      try {
        await this._hub().sendCommand(deviceId, 'runtime_stop', {});
      } catch { /* ignore */ }
    }
    if (deviceId) this._reg().detach(deviceId);
    this.connected = false;
  }

  _syncTagsFromParc(tags, store) {
    const { device: dev } = this._registryLookup();
    const quality = !dev || dev.stale ? QUALITY.STALE : QUALITY.GOOD;
    const snap = new Map((dev?.tags || []).map((t) => [t.id, t]));
    for (const t of tags) {
      const row = snap.get(t.id);
      if (!row) {
        if (quality === QUALITY.STALE) {
          store.setValue(t.id, store.get(t.id)?.value ?? t.value, QUALITY.STALE);
        }
        continue;
      }
      if (typeof store.applyDeviceTelemetry === 'function') {
        store.applyDeviceTelemetry(t.id, row, quality);
      } else {
        let val = row.value;
        if (t.type === 'BOOL') val = !!val;
        else if (t.type === 'INT') val = Math.trunc(Number(val) || 0);
        else if (t.type === 'REAL' || t.type === 'PID' || t.type === 'AVG') val = Number(val) || 0;
        store.setValue(t.id, val, quality);
      }
    }
    if (!dev) this._lastError = 'no Parc telemetry yet';
    else if (dev.stale) this._lastError = 'telemetry stale';
    else this._lastError = '';
    this.connected = quality === QUALITY.GOOD;
  }

  async readBatch(tags, store) {
    if (this.cfg.remoteExecution) return;
    this._syncTagsFromParc(tags, store);
  }

  async writeBatch(tags, store) {
    if (this.cfg.remoteExecution) return;
    const deviceId = this._deviceId();
    if (!deviceId) return;
    const mode = this._deviceMode();
    if (mode !== 'remote_io') return;
    const outputs = {};
    for (const t of tags) {
      if (t.role !== 'output') continue;
      const v = store.get(t.id)?.value;
      outputs[t.id] = t.type === 'BOOL' ? !!v : Number(v) || 0;
    }
    if (!Object.keys(outputs).length) return;
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected) {
      throw new Error(hubReady.error || 'MQTT hub not connected');
    }
    await this._hub().sendCommand(deviceId, 'write_outputs', { outputs }, { timeoutMs: 8000 });
  }

  isTracePending() {
    if (!this._traceMap?.length) return false;
    const dev = this._reg().getDevice(this._deviceId());
    const pt = dev?.programTrace;
    return !Array.isArray(pt) || pt.length === 0;
  }

  getProgramTrace() {
    const dev = this._reg().getDevice(this._deviceId());
    return expandRemoteProgramTrace(this._traceMap, dev?.programTrace || []);
  }

  async _deployViaMqtt(hub, deviceId, body, payloadBytes, built) {
    const attempts = 3;
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      try {
        await hub.sendCommand(deviceId, 'put_program', body);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    if (lastErr) throw lastErr;
    this._traceMap = built.traceMap || [];
    this.connected = true;
    this._lastError = '';
    this._reg().touchReport(deviceId);
    console.log(
      `[mqtt-parc] put_program OK (MQTT) → ${deviceId} (${payloadBytes} bytes, ${built.body?.tagCount ?? '?'} tags)`,
    );
    return { ok: true, errors: [] };
  }

  _optaAutoRunOnBoot() {
    const settings = persistence.readJson('settings.json', {}) || {};
    return settings.optaAutoRunOnBoot === true;
  }

  _deployMeta() {
    return clientDeployMeta({
      programName: programStore.activeRel() || '',
      autoRunOnBoot: this._optaAutoRunOnBoot(),
    });
  }

  shouldSkipNvDeploy(built, deviceId) {
    if (!built?.ok || !built.body?.bc) return false;
    const dev = this._reg().getDevice(deviceId);
    const rt = dev?.runtime;
    if (!rt?.programFromNv || !rt?.programOk || !rt?.programNvCrc) return false;
    const crc = bcDeployCrc(built.body.bc);
    return crc === Number(rt.programNvCrc);
  }

  async deployProgram(source, tagStore) {
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected || !this._hub().isLive()) {
      return { ok: false, errors: [hubReady.error || 'MQTT hub not connected'] };
    }
    const built = buildOptaProgramBody(source, tagStore, this.cfg.id);
    if (!built.ok) return built;
    const body = {
      ...built.body,
      ...this._deployMeta(),
    };
    const mqttBody = slimPutProgramBodyForMqtt(body, built.traceMap);
    const payloadBytes = Buffer.byteLength(JSON.stringify(mqttBody));
    const httpPayloadBytes = Buffer.byteLength(JSON.stringify(body));
    const { OPTA_PROGRAM_MAX_BYTES } = require('./optaProtocol');
    const { appendOptaBrokerHint } = require('../parc/mqttBrokerHint');
    if (payloadBytes >= OPTA_PROGRAM_MAX_BYTES) {
      return {
        ok: false,
        errors: [`Program deploy is ${payloadBytes} bytes (limit ${OPTA_PROGRAM_MAX_BYTES})`],
      };
    }
    const deviceId = this._deviceId();
    const hub = this._hub();
    const dev = this._reg().getDevice(deviceId);
    if (dev?.meta?.deviceMode === 'remote_io' || dev?.deviceMode === 'remote_io') {
      return {
        ok: false,
        errors: ['Opta is in Remote I/O mode — ST runs on PC. Set Standalone on device /setup to deploy to Opta.'],
      };
    }
    const fw = String(dev?.meta?.firmwareVersion || dev?.firmwareVersion || '').trim();

    const { waitForParcCmdHealth } = require('../parc/waitForParcDevice');
    const cmdHealth = await waitForParcCmdHealth(deviceId, {
      attempts: 3,
      timeoutMs: Math.max(12000, Number(this.cfg.commandTimeoutMs) || 15000),
      retryDelayMs: 2000,
    });
    if (!cmdHealth.ok) {
      return { ok: false, errors: [cmdHealth.error] };
    }

    if (fw && semverCompare(fw, '2.3.18') < 0) {
      return {
        ok: false,
        errors: [
          `Opta firmware v${fw} is too old for Parc deploy — upload PeaklogicOptaMqttSt v2.3.18+ via Arduino IDE (Parc deploy does not flash firmware)`,
        ],
      };
    }

    console.log(
      `[mqtt-parc] put_program MQTT → ${deviceId} (${payloadBytes} bytes, fw=${fw || 'unknown'})`,
    );
    try {
      return await this._deployViaMqtt(hub, deviceId, mqttBody, payloadBytes, built);
    } catch (mqttErr) {
      const host = String(dev?.meta?.ethIp || dev?.meta?.lastHost || this.cfg.host || '').trim();
      if (!host) {
        const msg = appendOptaBrokerHint(mqttErr.message || String(mqttErr));
        return { ok: false, errors: [msg] };
      }
      console.warn(`[mqtt-parc] MQTT deploy failed (${mqttErr.message || mqttErr}) — trying HTTP`);
      try {
        const { deployOptaProgramHttp } = require('../parc/optaHttpDeploy');
        console.log(
          `[mqtt-parc] put_program HTTP → ${host} (${httpPayloadBytes} bytes, fw=${fw || 'unknown'})`,
        );
        await deployOptaProgramHttp(host, mqttBody, {
          port: this.cfg.port || 80,
          timeoutMs: Math.min(15000, this.cfg.programTimeoutMs || 60000),
        });
        this._traceMap = built.traceMap || [];
        this.connected = true;
        this._lastError = '';
        console.log(
          `[mqtt-parc] put_program OK (HTTP) → ${deviceId} (${payloadBytes} bytes, ${built.body?.tagCount ?? '?'} tags)`,
        );
        return { ok: true, errors: [] };
      } catch (httpErr) {
        const msg = appendOptaBrokerHint(
          `MQTT: ${mqttErr.message || mqttErr}; HTTP: ${httpErr.message || httpErr}`,
        );
        return { ok: false, errors: [msg] };
      }
    }
  }

  async startRuntime() {
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected || !this._hub().isLive()) {
      throw new Error(hubReady.error || 'MQTT hub not connected');
    }
    const scanMs = Number(this.cfg.scanMs) || 100;
    const deviceId = this._deviceId();
    this._reg().attach(deviceId, { sessionId: 'peaklogic-pc' });
    const reportMs = Math.max(100, Math.min(600000, Number(this.cfg.reportIntervalMs) || scanMs * 2));
    this._hub().publishDeviceConfig(deviceId, {
      pauseTelemetry: false,
      debugAttached: true,
      reportMs,
    });
    const attempts = 3;
    const timeoutMs = Math.max(20000, Number(this.cfg.commandTimeoutMs) || 30000);
    let lastErr;
    for (let i = 0; i < attempts; i += 1) {
      try {
        await this._hub().sendCommand(deviceId, 'runtime_start', { scanMs }, { timeoutMs });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) {
          console.warn(
            `[mqtt-parc] runtime_start attempt ${i + 1}/${attempts} failed (${e.message || e}) — retrying`,
          );
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    if (lastErr) throw lastErr;
    this._reg().touchReport(deviceId);
    this.connected = true;
    this._lastError = '';
    console.log(`[mqtt-parc] runtime_start → ${deviceId} scanMs=${scanMs}`);
  }

  async stopRuntime() {
    const deviceId = this._deviceId();
    try {
      if (deviceId && this._hub().isLive()) {
        await this._hub().sendCommand(deviceId, 'runtime_stop', {});
      }
    } catch { /* device may already be stopped or hub offline */ }
    if (deviceId) {
      this._reg().detach(deviceId);
      if (this._hub().isLive()) {
        this._hub().publishDeviceConfig(deviceId, {
          pauseTelemetry: false,
          debugAttached: false,
        });
      }
    }
  }

  async syncTime(opts = {}) {
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected) {
      throw new Error(hubReady.error || 'MQTT hub not connected');
    }
    const deviceId = String(opts.deviceId || this._deviceId()).trim();
    if (!deviceId) throw new Error('mqtt_parc driver missing deviceId');
    const body = buildSyncTimeBody();
    await this._hub().sendCommand(deviceId, 'sync_time', body, { timeoutMs: 8000 });
    return { ok: true, deviceId, ...body };
  }

  async syncTagForce(tag, opts = {}) {
    if (!tag?.id) return { ok: true, skipped: true };
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected) {
      throw new Error(hubReady.error || 'MQTT hub not connected');
    }
    const deviceId = String(opts.deviceId || this._deviceId()).trim();
    if (!deviceId) throw new Error('mqtt_parc driver missing deviceId');
    const body = { tagId: tag.id };
    if (tag.forceInput || tag.forceOutput) {
      body.forceInput = !!tag.forceInput;
      body.forceOutput = !!tag.forceOutput;
      if (tag.forceValue !== undefined) body.forceValue = tag.forceValue;
      else body.forceValue = tag.value;
      await this._hub().sendCommand(deviceId, 'set_force', body, { timeoutMs: 8000 });
    } else {
      await this._hub().sendCommand(deviceId, 'clear_force', body, { timeoutMs: 8000 });
    }
    return { ok: true };
  }

  async writeMemory(tag, opts = {}) {
    return this.writeMemoryMany(tag ? [tag] : [], opts);
  }

  async writeMemoryMany(tags, opts = {}) {
    const rows = (Array.isArray(tags) ? tags : [])
      .filter((t) => t?.id)
      .map((t) => ({
        id: t.id,
        value: t.type === 'BOOL' ? !!t.value : t.value,
      }));
    if (!rows.length) return { ok: true, skipped: true };
    const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');
    const hubReady = await ensureMqttHubConnected({ persist: false });
    if (!hubReady.connected) {
      throw new Error(hubReady.error || 'MQTT hub not connected');
    }
    const deviceId = String(opts.deviceId || this._deviceId()).trim();
    if (!deviceId) throw new Error('mqtt_parc driver missing deviceId');
    await this._hub().sendCommand(deviceId, 'write_memory', {
      tags: rows,
    }, { timeoutMs: 8000 });
    return { ok: true, deviceId, written: rows.length };
  }

  async runScanCycle(store) {
    const snapIds = new Set((this._reg().getDevice(this._deviceId())?.tags || []).map((t) => t.id));
    const maps = store.list().filter((t) => t.driverId === this.cfg.id || snapIds.has(t.id));
    this._syncTagsFromParc(maps, store);
    if (this.cfg.remoteExecution) {
      store.applyForcesAfterLogic();
    }
    return { ok: true, tags: maps.length };
  }
}

module.exports = { MqttParcOptaDriver };
