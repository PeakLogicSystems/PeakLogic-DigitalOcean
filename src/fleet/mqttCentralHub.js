'use strict';

const crypto = require('crypto');
const mqtt = require('mqtt');
const { topics, deviceIdFromTopic } = require('./mqttProtocol');
const { optaStatusToFleetReport } = require('./optaTelemetryMapper');

function defaultCentralSettings() {
  return {
    enabled: false,
    brokerUrl: 'mqtt://127.0.0.1:1883',
    topicPrefix: 'mooreview/v1',
    clientId: 'mv-central-hmi',
    username: '',
    password: '',
    commandTimeoutMs: 15000,
  };
}

class MqttCentralHub {
  constructor({ registry }) {
    this.registry = registry;
    this.cfg = defaultCentralSettings();
    this.client = null;
    this.connected = false;
    this._pending = new Map();
  }

  status() {
    return {
      enabled: !!this.cfg.enabled,
      connected: this.connected,
      brokerUrl: this.cfg.brokerUrl,
      pendingCommands: this._pending.size,
    };
  }

  async start(rawCfg) {
    await this.stop();
    this.cfg = { ...defaultCentralSettings(), ...(rawCfg || {}) };
    if (!this.cfg.enabled) return;

    this.client = mqtt.connect(this.cfg.brokerUrl, {
      clientId: this.cfg.clientId || 'mv-central-hmi',
      username: this.cfg.username || undefined,
      password: this.cfg.password || undefined,
      keepalive: 60,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.connected = true;
      const subs = [
        topics(this.cfg, '_').wildcardTelemetry,
        topics(this.cfg, '_').wildcardCmdResponse,
        topics(this.cfg, '_').wildcardOnline,
      ];
      if (this.cfg.legacyOpta !== false) {
        subs.push(this.cfg.legacyOptaTopic || 'opta/status');
        subs.push('opta/set/relay/#');
      }
      this.client.subscribe(subs, { qos: 1 }, (err) => {
        if (err) console.error('[mqtt-fleet-hub] subscribe:', err.message);
      });
    });

    this.client.on('message', (topic, buf) => this._onMessage(topic, buf));
    this.client.on('close', () => { this.connected = false; });
    this.client.on('error', (e) => console.error('[mqtt-fleet-hub]', e.message));
  }

  async stop() {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MQTT hub stopped'));
    }
    this._pending.clear();
    if (this.client) {
      try { this.client.end(true); } catch { /* ignore */ }
    }
    this.client = null;
    this.connected = false;
  }

  async reload(rawCfg) {
    await this.start(rawCfg);
  }

  _handleLegacyOpta(topic, text) {
    if (topic === (this.cfg.legacyOptaTopic || 'opta/status')) {
      try {
        const raw = JSON.parse(text);
        const deviceId = this.cfg.legacyOptaDeviceId || 'opta_full_io_01';
        const report = optaStatusToFleetReport(deviceId, raw, {
          name: 'Arduino Opta',
          platform: 'arduino-opta',
        });
        this.registry.ingestReport(report);
      } catch (e) {
        console.error('[mqtt-fleet-hub] opta status:', e.message);
      }
      return true;
    }
    return false;
  }

  publishLegacyOptaRelay(relay, state) {
    if (!this.client?.connected) return false;
    const topic = 'opta/set/relay/1';
    this.client.publish(topic, JSON.stringify({ relay, state: !!state }), { qos: 1 });
    return true;
  }

  _onMessage(topic, buf) {
    const text = buf.toString();
    if (this._handleLegacyOpta(topic, text)) return;

    const deviceId = deviceIdFromTopic(topic, this.cfg);
    if (!deviceId) return;

    if (topic.endsWith('/telemetry')) {
      try {
        const body = JSON.parse(text);
        this.registry.ingestReport({ ...body, deviceId: body.deviceId || deviceId });
      } catch (e) {
        console.error('[mqtt-fleet-hub] telemetry:', e.message);
      }
      return;
    }

    if (topic.endsWith('/cmd/response')) {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      const p = this._pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this._pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.body);
      else p.reject(Object.assign(new Error(msg.error || 'command failed'), { status: msg.status || 500 }));
      return;
    }

    if (topic.endsWith('/online')) {
      try {
        const msg = JSON.parse(text);
        if (msg.online === false) {
          const dev = this.registry.getDevice(deviceId);
          if (dev) {
            this.registry.ingestReport({
              deviceId,
              tags: dev.tags || [],
              runtime: { ...(dev.runtime || {}), running: false },
              meta: { online: false },
            });
          }
        }
      } catch { /* ignore */ }
    }
  }

  publishDeviceConfig(deviceId, patch) {
    if (!this.client?.connected) return false;
    const t = topics(this.cfg, deviceId);
    this.client.publish(t.config, JSON.stringify(patch), { qos: 1 });
    return true;
  }

  sendCommand(deviceId, op, body) {
    if (!this.client?.connected) {
      return Promise.reject(new Error('MQTT hub not connected'));
    }
    const id = crypto.randomUUID();
    const t = topics(this.cfg, deviceId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MQTT command timeout (${op})`));
      }, Math.max(3000, Number(this.cfg.commandTimeoutMs) || 15000));
      this._pending.set(id, { resolve, reject, timer });
      this.client.publish(t.cmd, JSON.stringify({ id, op, body: body || {} }), { qos: 1 });
    });
  }
}

let hubSingleton = null;

function getMqttCentralHub(registry) {
  if (!hubSingleton) hubSingleton = new MqttCentralHub({ registry });
  return hubSingleton;
}

module.exports = {
  MqttCentralHub,
  getMqttCentralHub,
  defaultCentralSettings,
};
