'use strict';

const mqtt = require('mqtt');
const { cloudTopics } = require('../parc/cloudMqttTopics');
const { buildSimTelemetry } = require('./simTelemetry');

class SimRunner {
  constructor(sim, mqttCfg = {}) {
    this.sim = sim;
    this.mqttCfg = mqttCfg;
    this.client = null;
    this.timer = null;
    this.tick = 0;
    this.startedAt = null;
    this.lastPublishAt = null;
    this.lastError = null;
  }

  _brokerUrl() {
    return String(this.sim.config?.brokerUrl || this.mqttCfg.brokerUrl || '').trim();
  }

  _topicCfg() {
    return {
      topicPrefix: this.sim.config?.topicPrefix || this.mqttCfg.topicPrefix || 'peaklogic/v1',
    };
  }

  _mqttOptions() {
    const opts = {
      clientId: `peaklogic-sim-${this.sim.id}`.slice(0, 64),
      reconnectPeriod: 0,
      keepalive: 30,
    };
    const username = this.mqttCfg.username || '';
    const password = this.mqttCfg.password || '';
    if (username) opts.username = username;
    if (password) opts.password = password;
    return opts;
  }

  async connect() {
    const brokerUrl = this._brokerUrl();
    if (!brokerUrl) {
      throw new Error('MQTT broker URL not configured — set mqttParc.brokerUrl in System setup or sim.config.brokerUrl');
    }
    if (this.client?.connected) return this.client;

    await new Promise((resolve, reject) => {
      const c = mqtt.connect(brokerUrl, this._mqttOptions());
      const onConnect = () => {
        cleanup();
        this.client = c;
        resolve(c);
      };
      const onError = (err) => {
        cleanup();
        c.end(true);
        reject(err);
      };
      const cleanup = () => {
        c.off('connect', onConnect);
        c.off('error', onError);
      };
      c.once('connect', onConnect);
      c.once('error', onError);
    });
    return this.client;
  }

  async publishOnce() {
    const report = buildSimTelemetry(this.sim, this.tick++);
    const topics = cloudTopics(this._topicCfg(), this.sim.tenantId, this.sim.mqttDeviceId);
    const body = JSON.stringify(report);
    await new Promise((resolve, reject) => {
      this.client.publish(topics.telemetry, body, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      this.client.publish(topics.online, JSON.stringify({
        deviceId: this.sim.mqttDeviceId,
        online: true,
        tenantId: this.sim.tenantId,
        simId: this.sim.id,
        source: 'peaklogic-cloud-sim',
      }), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.lastPublishAt = new Date().toISOString();
  }

  async start() {
    if (this.timer) return { ok: true, alreadyRunning: true };
    await this.connect();
    const intervalMs = Math.max(200, Number(this.sim.config?.intervalMs) || 2000);
    await this.publishOnce();
    this.startedAt = new Date().toISOString();
    this.timer = setInterval(() => {
      this.publishOnce().catch((err) => {
        this.lastError = err.message || String(err);
        console.warn(`[cloud-sim] ${this.sim.id} publish:`, this.lastError);
      });
    }, intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return { ok: true, intervalMs };
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.client) {
      await new Promise((resolve) => {
        this.client.end(false, {}, () => resolve());
      });
      this.client = null;
    }
    return { ok: true };
  }

  status() {
    return {
      simId: this.sim.id,
      running: !!this.timer,
      startedAt: this.startedAt,
      lastPublishAt: this.lastPublishAt,
      lastError: this.lastError,
      brokerUrl: this._brokerUrl(),
      tick: this.tick,
    };
  }
}

module.exports = { SimRunner };
