'use strict';

const mqttSimHub = require('./mqttSimHub');

class MqttSimDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.connected = false;
    this._lastError = '';
    this._hubStatus = null;
  }

  health() {
    if (!this.connected) return this._lastError || 'disconnected';
    const st = mqttSimHub.status();
    if (!st.running) return 'stopped';
    const pub = st.publisherConnected ? 'broker OK' : 'in-memory';
    return `simulating ${st.stationCount} station(s) · ${pub}`;
  }

  async connect(cfg) {
    this.cfg = cfg || this.cfg;
    try {
      this._hubStatus = mqttSimHub.start({
        brokerUrl: this.cfg.brokerUrl || this.cfg.broker,
        intervalMs: this.cfg.intervalMs,
        samplePath: this.cfg.samplePath,
        stations: this.cfg.stations,
        peerDrivers: this.cfg.peerDrivers,
        publishToBroker: this.cfg.publishToBroker !== false,
      });
      this.connected = true;
      this._lastError = '';
    } catch (e) {
      this._lastError = e.message || String(e);
      this.connected = false;
      throw e;
    }
  }

  async disconnect() {
    mqttSimHub.stop();
    this.connected = false;
    this._hubStatus = null;
  }

  async readBatch() {
    /* Hub feeds mqtt drivers via mqttSimHub.peek — no tag mappings on this driver. */
  }

  async writeBatch() {}
}

module.exports = { MqttSimDriver };
