'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SAMPLE = path.join(ROOT, 'st/fixtures/edgepoint-lift-station-sample.json');
const DEFAULT_BROKER = 'mqtt://127.0.0.1:1883';
const DEFAULT_INTERVAL_MS = 5000;

/** @type {ReturnType<typeof setInterval> | null} */
let _timer = null;
/** @type {import('mqtt').MqttClient | null} */
let _publisher = null;
let _brokerUrl = '';
let _intervalMs = DEFAULT_INTERVAL_MS;
/** @type {Map<string, string>} */
let _cache = new Map();
/** @type {{ serialNum: string, topic?: string, payload?: string }[]} */
let _stations = [];
/** @type {object} */
let _sample = {};
let _refCount = 0;
let _startedAt = 0;

function normalizeBroker(url) {
  return String(url || DEFAULT_BROKER).trim().replace(/\/+$/, '') || DEFAULT_BROKER;
}

function topicForSerial(serialNum) {
  return `/devices/${serialNum}/messages/events/`;
}

function resolveSamplePath(samplePath) {
  if (!samplePath) return DEFAULT_SAMPLE;
  const p = path.isAbsolute(samplePath) ? samplePath : path.join(ROOT, samplePath);
  return p;
}

function loadSample(samplePath) {
  const p = resolveSamplePath(samplePath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function buildPayload(serialNum) {
  return JSON.stringify({ ..._sample, 10: serialNum, mac: serialNum });
}

function publishAll() {
  for (const s of _stations) {
    const topic = s.topic || topicForSerial(s.serialNum);
    const payload = s.payload || buildPayload(s.serialNum);
    _cache.set(topic, payload);
    if (_publisher?.connected) {
      _publisher.publish(topic, payload, { qos: 0 });
    }
  }
}

function discoverStationsFromDrivers(configs) {
  const serials = new Set();
  for (const c of configs || []) {
    if (c.type !== 'mqtt' || c.enabled === false) continue;
    for (const topic of c.subscriptions || []) {
      const m = String(topic).match(/^\/devices\/([^/]+)\/messages\/events\/?$/);
      if (m) serials.add(m[1]);
    }
    if (c.serialNum) serials.add(String(c.serialNum));
  }
  return [...serials].map((serialNum) => ({ serialNum }));
}

/**
 * Start in-memory lift MQTT simulation (and optionally publish to a real broker).
 * @param {object} cfg
 */
function start(cfg = {}) {
  _refCount += 1;
  if (_timer) {
    return { ok: true, alreadyRunning: true, stationCount: _stations.length };
  }

  _brokerUrl = normalizeBroker(cfg.brokerUrl);
  _intervalMs = Number(cfg.intervalMs) > 0 ? Number(cfg.intervalMs) : DEFAULT_INTERVAL_MS;
  _sample = loadSample(cfg.samplePath);

  let stations = Array.isArray(cfg.stations) ? cfg.stations : [];
  stations = stations.map((s) => (typeof s === 'string' ? { serialNum: s } : s)).filter((s) => s?.serialNum);
  if (!stations.length && Array.isArray(cfg.peerDrivers)) {
    stations = discoverStationsFromDrivers(cfg.peerDrivers);
  }
  _stations = stations;

  if (!_stations.length) {
    _refCount = Math.max(0, _refCount - 1);
    throw new Error('mqtt_sim: no stations — set stations[] or enable mqtt lift drivers with serial subscriptions');
  }

  if (cfg.publishToBroker !== false) {
    _publisher = mqtt.connect(_brokerUrl, {
      clientId: `peaklogic-mqtt-sim-${Date.now().toString(36)}`,
      reconnectPeriod: 5000,
    });
    _publisher.on('error', () => { /* broker optional — in-memory cache still works */ });
  }

  publishAll();
  _timer = setInterval(publishAll, _intervalMs);
  _startedAt = Date.now();
  return { ok: true, stationCount: _stations.length, brokerUrl: _brokerUrl, intervalMs: _intervalMs };
}

function stop() {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount > 0) return;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  if (_publisher) {
    _publisher.end(true);
    _publisher = null;
  }
  _cache.clear();
  _stations = [];
  _brokerUrl = '';
  _startedAt = 0;
}

function isRunning() {
  return _timer != null;
}

function coversBroker(brokerUrl) {
  return isRunning() && normalizeBroker(brokerUrl) === _brokerUrl;
}

function peek(topic, brokerUrl) {
  if (!isRunning()) return undefined;
  if (normalizeBroker(brokerUrl) !== _brokerUrl) return undefined;
  return _cache.get(topic);
}

function status() {
  return {
    running: isRunning(),
    brokerUrl: _brokerUrl,
    intervalMs: _intervalMs,
    stationCount: _stations.length,
    stations: _stations.map((s) => s.serialNum),
    publisherConnected: !!_publisher?.connected,
    startedAt: _startedAt || null,
  };
}

module.exports = {
  start,
  stop,
  isRunning,
  coversBroker,
  peek,
  status,
  discoverStationsFromDrivers,
  topicForSerial,
  normalizeBroker,
};
