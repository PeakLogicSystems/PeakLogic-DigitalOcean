'use strict';

/**
 * Cloud-side MQTT ingest — Optas talk MQTT directly to the cloud.
 *
 * The cloud droplet subscribes to the MQTT broker that field Optas publish to
 * (peaklogic/v1/{deviceId}/telemetry and /online), resolves the owning
 * tenant/system from the bound device record, and writes the SaaS operational
 * collections (parc_devices / device_telemetry_latest) via storeSlimTelemetry —
 * the same store the Sites/Fleet pages read. No HTTP gateway relay in between:
 * the device is the MQTT client, the cloud is the MQTT subscriber.
 *
 * Config (env):
 *   PEAKLOGIC_MQTT_BROKER        broker URL (default mqtt://127.0.0.1:1883)
 *   PEAKLOGIC_MQTT_TOPIC_PREFIX  topic prefix (default peaklogic/v1)
 *   MQTT_INGEST_USERNAME/PASSWORD optional broker auth
 *   CLOUD_MQTT_INGEST=false      disable this subscriber
 */

const crypto = require('crypto');
const mqtt = require('mqtt');
const { getDb } = require('../db/mongo');
const { DEFAULT_MQTT_PARC_BROKER } = require('../config');
const { storeSlimTelemetry } = require('./storeSlimTelemetry');

const TOPIC_PREFIX = String(process.env.PEAKLOGIC_MQTT_TOPIC_PREFIX || 'peaklogic/v1')
  .trim()
  .replace(/\/+$/, '');
const OWNER_CACHE_TTL_MS = 60_000;
const DEFAULT_CMD_TIMEOUT_MS = 15_000;
const PUT_PROGRAM_TIMEOUT_MS = 120_000;
/**
 * Some devices (e.g. a triplex whose telemetry payload exceeds the Opta MQTT
 * buffer) never deliver periodic telemetry, so firmwareVersion/online would never
 * reach the cloud. We poll runtime_status on a slow cadence to keep those fields
 * fresh purely from the (small) command-response path. Disable with STATUS_POLL_MS=0.
 */
const STATUS_POLL_MS = Number(process.env.MV_STATUS_POLL_MS ?? 60_000);

let client = null;
let connected = false;
let statusPollTimer = null;
/** deviceId -> { owner: {tenantId, systemId}|null, expires } */
const ownerCache = new Map();
/** cmd id -> { resolve, reject, timer } */
const pending = new Map();

function deviceIdFromTopic(topic) {
  if (!topic.startsWith(`${TOPIC_PREFIX}/`)) return null;
  return topic.slice(TOPIC_PREFIX.length + 1).split('/')[0] || null;
}

/** Resolve the tenant/system that owns a bound device id (found owners cached). */
async function resolveOwner(deviceId) {
  const cached = ownerCache.get(deviceId);
  if (cached && cached.expires > Date.now()) return cached.owner;

  const dev = await getDb().collection('devices').findOne(
    { 'driverConfig.deviceId': deviceId },
    { projection: { tenantId: 1, systemId: 1 } },
  );
  const owner = dev ? { tenantId: dev.tenantId, systemId: dev.systemId } : null;
  if (owner) ownerCache.set(deviceId, { owner, expires: Date.now() + OWNER_CACHE_TTL_MS });
  return owner;
}

async function handleTelemetry(deviceId, body) {
  const owner = await resolveOwner(deviceId);
  if (!owner) return false;
  await storeSlimTelemetry({
    tenantId: owner.tenantId,
    systemId: owner.systemId,
    deviceId,
    publishedAt: body.publishedAt || new Date().toISOString(),
    report: { platform: 'arduino-opta', ...body, deviceId },
  });
  return true;
}

async function handleOnline(deviceId, body) {
  const owner = await resolveOwner(deviceId);
  if (!owner) return false;

  if (body.online === false) {
    await getDb().collection('parc_devices').updateOne(
      { tenantId: owner.tenantId, deviceId },
      { $set: { online: false, updatedAt: new Date() } },
    );
    return true;
  }

  await storeSlimTelemetry({
    tenantId: owner.tenantId,
    systemId: owner.systemId,
    deviceId,
    publishedAt: new Date().toISOString(),
    report: {
      platform: 'arduino-opta',
      deviceId,
      name: body.name || deviceId,
      tags: [],
      runtime: body.runtime || null,
      meta: { source: 'mqtt-online-birth' },
    },
  });
  return true;
}

/**
 * Persist device identity fields (firmware/protocol/buffer) learned from a command
 * response body. This is the fallback path for devices that can't stream telemetry
 * (payload > MQTT buffer): the small cmd/response still carries firmwareVersion.
 * Never touches tags — only sets the fields present, so it can't blank live data.
 */
async function persistStatusFromResponse(deviceId, body) {
  if (!deviceId || !body || typeof body !== 'object') return;
  if (body.firmwareVersion == null
    && body.protocolVersion == null
    && body.mqttBufferBytes == null) return;

  const owner = await resolveOwner(deviceId);
  if (!owner) return;

  const now = new Date();
  const set = { online: true, lastSeenAt: now, updatedAt: now };
  if (body.firmwareVersion != null) set.firmwareVersion = String(body.firmwareVersion);
  if (body.protocolVersion != null) set.protocolVersion = body.protocolVersion;
  if (body.mqttBufferBytes != null) set.mqttBufferBytes = body.mqttBufferBytes;

  const db = getDb();
  await Promise.all([
    db.collection('device_telemetry_latest').updateOne(
      { tenantId: owner.tenantId, deviceId },
      {
        $set: { ...set, receivedAt: now },
        $setOnInsert: {
          tenantId: owner.tenantId,
          deviceId,
          systemId: owner.systemId || null,
          name: deviceId,
          platform: 'arduino-opta',
        },
      },
      { upsert: true },
    ),
    db.collection('parc_devices').updateOne(
      { tenantId: owner.tenantId, deviceId },
      {
        $set: set,
        $setOnInsert: { tenantId: owner.tenantId, deviceId, createdAt: now, name: deviceId },
      },
      { upsert: true },
    ),
  ]);
}

function startCloudMqttIngest(opts = {}) {
  if (client) return client;
  const brokerUrl = opts.brokerUrl || DEFAULT_MQTT_PARC_BROKER;
  const mqttOpts = {
    clientId: opts.clientId || `mv-cloud-ingest-${process.pid}`,
    reconnectPeriod: 5000,
    keepalive: 60,
  };
  if (process.env.MQTT_INGEST_USERNAME) mqttOpts.username = process.env.MQTT_INGEST_USERNAME;
  if (process.env.MQTT_INGEST_PASSWORD) mqttOpts.password = process.env.MQTT_INGEST_PASSWORD;

  client = mqtt.connect(brokerUrl, mqttOpts);

  client.on('connect', () => {
    connected = true;
    const subs = [
      `${TOPIC_PREFIX}/+/telemetry`,
      `${TOPIC_PREFIX}/+/online`,
      `${TOPIC_PREFIX}/+/cmd/response`,
    ];
    client.subscribe(subs, { qos: 1 }, (err) => {
      if (err) console.error('[cloud-mqtt-ingest] subscribe:', err.message);
      else console.log(`[cloud-mqtt-ingest] connected ${brokerUrl}; subscribed ${subs.join(', ')}`);
    });
    if (STATUS_POLL_MS > 0 && !statusPollTimer) {
      statusPollTimer = setInterval(() => { pollBoundDeviceStatus().catch(() => {}); }, STATUS_POLL_MS);
      if (statusPollTimer.unref) statusPollTimer.unref();
      setTimeout(() => { pollBoundDeviceStatus().catch(() => {}); }, 3_000);
      console.log(`[cloud-mqtt-ingest] status poll every ${STATUS_POLL_MS}ms (MV_STATUS_POLL_MS=0 to disable)`);
    }
  });

  client.on('message', (topic, buf) => {
    const deviceId = deviceIdFromTopic(topic);
    if (!deviceId) return;
    if (topic.endsWith('/cmd/response')) {
      handleCmdResponse(deviceId, buf);
      return;
    }
    let body;
    try {
      body = JSON.parse(buf.toString() || '{}');
    } catch {
      return;
    }
    const done = topic.endsWith('/telemetry')
      ? handleTelemetry(deviceId, body)
      : topic.endsWith('/online')
        ? handleOnline(deviceId, body)
        : null;
    if (done) {
      done.catch((err) => console.warn(`[cloud-mqtt-ingest] ${deviceId}: ${err.message}`));
    }
  });

  client.on('close', () => { connected = false; });
  client.on('error', (err) => console.error('[cloud-mqtt-ingest]', err.message));
  return client;
}

function handleCmdResponse(deviceId, buf) {
  let msg;
  try {
    msg = JSON.parse(buf.toString() || '{}');
  } catch {
    return;
  }
  if (!msg) return;

  // Opportunistically capture firmware/status from any successful response body —
  // this is how devices that can't stream telemetry still surface their firmware.
  if (msg.ok && msg.body && typeof msg.body === 'object') {
    persistStatusFromResponse(deviceId, msg.body).catch((err) => {
      console.warn(`[cloud-mqtt-ingest] status persist ${deviceId}: ${err.message}`);
    });
  }

  if (msg.id == null) return;
  const p = pending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(msg.id);
  if (msg.ok) p.resolve(msg.body ?? {});
  else p.reject(Object.assign(new Error(msg.error || 'command failed'), { status: msg.status || 500 }));
}

/**
 * Slow poll: ask each bound device for runtime_status so firmwareVersion + online
 * stay fresh even when telemetry can't be delivered. Responses are captured by
 * handleCmdResponse → persistStatusFromResponse. Fire-and-forget; timeouts are fine.
 */
async function pollBoundDeviceStatus() {
  if (!isConnected()) return;
  let devices;
  try {
    devices = await getDb().collection('devices')
      .find({ 'driverConfig.deviceId': { $exists: true, $ne: null } },
        { projection: { 'driverConfig.deviceId': 1 } })
      .toArray();
  } catch {
    return;
  }
  const seen = new Set();
  for (const dev of devices) {
    const id = dev?.driverConfig?.deviceId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sendCommand(id, 'runtime_status', {}, { timeoutMs: 8_000 }).catch(() => {});
  }
}

function isConnected() {
  return connected && !!client?.connected;
}

/**
 * Send an MQTT Parc command to a device and await its cmd/response.
 * @param {string} deviceId
 * @param {string} op — e.g. 'put_program', 'runtime_start', 'runtime_stop'
 * @param {object} [body]
 * @param {{ timeoutMs?: number }} [opts]
 */
function sendCommand(deviceId, op, body = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!isConnected()) {
      reject(new Error('Cloud MQTT ingest not connected to broker'));
      return;
    }
    const id = crypto.randomUUID();
    const timeoutMs = opts.timeoutMs
      ?? (op === 'put_program' ? PUT_PROGRAM_TIMEOUT_MS : DEFAULT_CMD_TIMEOUT_MS);
    const cmdTopic = `${TOPIC_PREFIX}/${deviceId}/cmd`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(
        `Command ${op} → ${deviceId} timed out after ${timeoutMs}ms `
        + '(device offline or not subscribed to its cmd topic)',
      ));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    const payload = JSON.stringify({ id, op, body: body || {} });
    client.publish(cmdTopic, payload, { qos: 1 }, (pubErr) => {
      if (pubErr) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error(`MQTT publish failed (${op}): ${pubErr.message}`));
      }
    });
  });
}

async function stopCloudMqttIngest() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error('Cloud MQTT ingest stopped'));
  }
  pending.clear();
  connected = false;
  if (!client) return;
  try {
    client.end(true);
  } catch {
    /* ignore */
  }
  client = null;
  ownerCache.clear();
}

module.exports = {
  startCloudMqttIngest,
  stopCloudMqttIngest,
  sendCommand,
  isConnected,
};
