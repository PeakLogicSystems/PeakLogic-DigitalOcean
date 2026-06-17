'use strict';

const { QUALITY } = require('../tags/constants');
const { registry } = require('../fleet/deviceRegistry');
const { getMqttCentralHub } = require('../fleet/mqttCentralHub');
const { buildOptaProgramBody } = require('../fleet/mqttOptaProgram');

class MqttFleetOptaDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._lastError = '';
  }

  _deviceId() {
    return String(this.cfg.deviceId || this.cfg.id || '').trim();
  }

  _hub() {
    return getMqttCentralHub(registry);
  }

  health() {
    if (!this.connected) return this._lastError || 'disconnected';
    const dev = registry.getDevice(this._deviceId());
    if (dev?.stale) return 'stale telemetry';
    return 'OK';
  }

  async connect(cfg) {
    this.cfg = { ...this.cfg, ...(cfg || {}) };
    const deviceId = this._deviceId();
    const hub = this._hub();
    if (!hub.status().connected) {
      this.connected = false;
      this._lastError = 'MQTT fleet hub not connected (enable mqttFleet in settings)';
      return false;
    }
    if (!deviceId) {
      this.connected = false;
      this._lastError = 'deviceId required';
      return false;
    }
    try {
      await hub.sendCommand(deviceId, 'runtime_status', {});
      this.connected = true;
      this._lastError = '';
      return true;
    } catch (e) {
      this.connected = false;
      this._lastError = e.message || String(e);
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
    if (deviceId) registry.detach(deviceId);
    this.connected = false;
  }

  _syncTagsFromFleet(tags, store) {
    const deviceId = this._deviceId();
    const dev = registry.getDevice(deviceId);
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
      let val = row.value;
      if (t.type === 'BOOL') val = !!val;
      else if (t.type === 'INT') val = Math.trunc(Number(val) || 0);
      else if (t.type === 'REAL' || t.type === 'PID' || t.type === 'AVG') val = Number(val) || 0;
      store.setValue(t.id, val, quality);
    }
    if (!dev) this._lastError = 'no fleet telemetry yet';
    else if (dev.stale) this._lastError = 'telemetry stale';
    else this._lastError = '';
    this.connected = quality === QUALITY.GOOD;
  }

  async readBatch(tags, store) {
    if (this.cfg.remoteExecution) return;
    this._syncTagsFromFleet(tags, store);
  }

  async writeBatch() {
    if (this.cfg.remoteExecution) return;
  }

  async deployProgram(source, tagStore) {
    const built = buildOptaProgramBody(source, tagStore, this.cfg.id);
    if (!built.ok) return built;
    await this._hub().sendCommand(this._deviceId(), 'put_program', built.body);
    return { ok: true, errors: [] };
  }

  async startRuntime() {
    const scanMs = Number(this.cfg.scanMs) || 100;
    const deviceId = this._deviceId();
    registry.attach(deviceId, { sessionId: 'mooreview-pc' });
    this._hub().publishDeviceConfig(deviceId, { pauseTelemetry: false, debugAttached: true });
    await this._hub().sendCommand(deviceId, 'runtime_start', { scanMs });
  }

  async stopRuntime() {
    await this._hub().sendCommand(this._deviceId(), 'runtime_stop', {});
  }

  async runScanCycle(store) {
    const maps = store.list().filter((t) => t.driverId === this.cfg.id);
    this._syncTagsFromFleet(maps, store);
    return { ok: true, tags: maps.length };
  }
}

module.exports = { MqttFleetOptaDriver };
