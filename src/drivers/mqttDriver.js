'use strict';

const mqtt = require('mqtt');
const { QUALITY } = require('../tags/constants');
const { parsePayload, formatPayloadForWrite, tagValueFromParsed } = require('./payloadTemplate');

class MqttDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.client = null;
    this.connected = false;
    this._cache = new Map();
    this._subscribed = new Set();
    this._lastError = '';
  }

  health() {
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  _brokerUrl() {
    return this.cfg.brokerUrl || this.cfg.broker || 'mqtt://127.0.0.1';
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    this._subscribed.clear();
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this._brokerUrl(), {
        clientId: this.cfg.clientId || 'peaklogic',
        username: this.cfg.username,
        password: this.cfg.password,
        keepalive: this.cfg.keepalive || 60,
        reconnectPeriod: 5000,
      });
      this.client.on('connect', () => {
        this.connected = true;
        this._lastError = '';
        const topics = new Set(this.cfg.subscriptions || []);
        const subs = [...topics];
        if (!subs.length) {
          resolve();
          return;
        }
        let pending = subs.length;
        for (const topic of subs) {
          this.client.subscribe(topic, { qos: this.cfg.subscribeQos || 0 }, (err) => {
            if (!err) this._subscribed.add(topic);
            pending -= 1;
            if (pending === 0) resolve();
          });
        }
      });
      this.client.on('message', (topic, payload) => {
        this._cache.set(topic, payload.toString());
      });
      this.client.on('error', (e) => {
        this._lastError = e.message;
        reject(e);
      });
    });
  }

  async disconnect() {
    if (this.client) this.client.end(true);
    this.client = null;
    this.connected = false;
    this._subscribed.clear();
  }

  async _ensureSubscribed(topic) {
    if (!this.client?.connected || !topic || this._subscribed.has(topic)) return;
    await new Promise((resolve, reject) => {
      this.client.subscribe(topic, { qos: this.cfg.subscribeQos || 0 }, (err) => {
        if (err) reject(err);
        else {
          this._subscribed.add(topic);
          resolve();
        }
      });
    });
  }

  async readBatch(tags, store) {
    for (const t of tags) {
      const topic = t.driverAddress?.topic;
      if (!topic) continue;
      try {
        await this._ensureSubscribed(topic);
      } catch (e) {
        this._lastError = e.message;
      }
    }
    for (const t of tags) {
      const a = t.driverAddress || {};
      if (!a.topic) continue;
      const raw = this._cache.get(a.topic);
      if (raw === undefined) {
        store.setValue(t.id, store.get(t.id)?.value ?? t.default, QUALITY.STALE);
        continue;
      }
      const val = parsePayload(raw, a.payloadTemplate);
      store.setValue(t.id, tagValueFromParsed(t, val), QUALITY.GOOD);
    }
  }

  async writeBatch(tags, store) {
    if (!this.client?.connected) return;
    for (const t of tags) {
      const a = t.driverAddress || {};
      if (!a.topic) continue;
      const v = store.get(t.id)?.value;
      const payload = formatPayloadForWrite(v, a.payloadTemplate);
      this.client.publish(a.topic, payload, { qos: this.cfg.publishQos || 0 });
    }
  }
}

module.exports = { MqttDriver };
