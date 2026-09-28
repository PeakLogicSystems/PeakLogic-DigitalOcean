'use strict';

const { Bacnet } = require('./bacnetConstants');

function promisify(fn, client, ...args) {
  return new Promise((resolve, reject) => {
    fn.call(client, ...args, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

function buildClientOptions(cfg = {}) {
  const opts = {
    port: Number(cfg.port) || 47808,
    apduTimeout: Number(cfg.apduTimeout) || Number(cfg.timeoutMs) || 6000,
  };
  const iface = cfg.interface || cfg.bindInterface || '';
  if (iface) opts.interface = iface;
  const bcast = cfg.broadcastAddress || cfg.broadcast;
  if (bcast) opts.broadcastAddress = bcast;
  return opts;
}

class BacnetClientWrapper {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.client = null;
    this.connected = false;
    this._lastError = '';
    this._listeningPromise = null;
  }

  health() {
    if (!Bacnet) return 'node-bacnet not installed';
    return this.connected ? 'OK' : (this._lastError || 'disconnected');
  }

  async connect(cfg) {
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    this._lastError = '';
    if (!Bacnet) {
      this._lastError = 'node-bacnet not installed';
      this.connected = false;
      return false;
    }
    await this.disconnect();
    this.client = new Bacnet(buildClientOptions(this.cfg));
    this.client.on('error', (err) => {
      this._lastError = err.message || String(err);
      this.connected = false;
    });
    this._listeningPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('BACnet bind timeout'));
      }, Number(this.cfg.bindTimeoutMs) || 8000);
      this.client.once('listening', () => {
        clearTimeout(timer);
        resolve();
      });
      this.client.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    try {
      await this._listeningPromise;
      this.connected = true;
      return true;
    } catch (e) {
      this._lastError = e.message || String(e);
      this.connected = false;
      try { this.client?.close(); } catch { /* ignore */ }
      this.client = null;
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.client) {
      try { this.client.close(); } catch { /* ignore */ }
      this.client = null;
    }
  }

  async readProperty(receiver, objectId, propertyId, options) {
    if (!this.client) throw new Error('BACnet client not connected');
    return promisify(this.client.readProperty, this.client, receiver, objectId, propertyId, options);
  }

  async readPropertyMultiple(receiver, requestArray, options) {
    if (!this.client) throw new Error('BACnet client not connected');
    return promisify(this.client.readPropertyMultiple, this.client, receiver, requestArray, options);
  }

  async writeProperty(receiver, objectId, propertyId, values, options) {
    if (!this.client) throw new Error('BACnet client not connected');
    return promisify(this.client.writeProperty, this.client, receiver, objectId, propertyId, values, options);
  }

  whoIs(lowLimit, highLimit) {
    if (!this.client) return;
    const opts = {};
    if (Number.isFinite(lowLimit)) opts.lowLimit = lowLimit;
    if (Number.isFinite(highLimit)) opts.highLimit = highLimit;
    if (Object.keys(opts).length) this.client.whoIs(opts);
    else this.client.whoIs();
  }

  onIAm(handler) {
    this.client?.on('iAm', handler);
  }

  offIAm(handler) {
    this.client?.removeListener('iAm', handler);
  }
}

module.exports = { BacnetClientWrapper, buildClientOptions };
