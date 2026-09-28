'use strict';

const { connectMongo, getDb } = require('../db/mongo');
const {
  buildLatestDoc,
  buildHistoryDoc,
  buildRegistryUpdate,
} = require('./slimTelemetry');

const LATEST = 'device_telemetry_latest';
const HISTORY = 'device_telemetry';
const REGISTRY = 'parc_devices';

/**
 * Slim operational write — full payloads remain in datalake (Event Hub Capture).
 * @param {object} msg — parsed ingest envelope
 */
async function storeSlimTelemetry(msg) {
  await connectMongo();
  const db = getDb();

  const latestDoc = buildLatestDoc(msg);
  const historyDoc = buildHistoryDoc(msg);
  const registry = buildRegistryUpdate(msg);

  // An online-birth (or any partial report) omits firmwareVersion/protocolVersion/
  // mqttBufferBytes. Don't let those blanks overwrite the last real telemetry values,
  // otherwise the UI flips back to "fw —" every time the device reconnects.
  const latestSet = { ...latestDoc };
  if (latestSet.firmwareVersion == null) delete latestSet.firmwareVersion;
  if (latestSet.protocolVersion == null) delete latestSet.protocolVersion;
  if (latestSet.mqttBufferBytes == null) delete latestSet.mqttBufferBytes;

  await db.collection(LATEST).updateOne(
    { tenantId: msg.tenantId, deviceId: msg.deviceId },
    { $set: latestSet },
    { upsert: true },
  );

  await db.collection(HISTORY).insertOne(historyDoc);

  const registrySet = {
    tenantId: registry.tenantId,
    deviceId: registry.deviceId,
    name: registry.name,
    platform: registry.platform,
    online: registry.online,
    lastSeenAt: registry.lastSeenAt,
    lastReport: registry.lastReport,
    updatedAt: registry.updatedAt,
  };
  // Only overwrite firmwareVersion when the report carries one, so an online-birth
  // (which may omit it) never wipes a previously reported version.
  if (registry.firmwareVersion) registrySet.firmwareVersion = registry.firmwareVersion;

  await db.collection(REGISTRY).updateOne(
    { tenantId: msg.tenantId, deviceId: msg.deviceId },
    {
      $set: registrySet,
      $setOnInsert: { createdAt: registry.createdAt },
    },
    { upsert: true },
  );

  if (msg.systemId) {
    await db.collection('devices').updateOne(
      { tenantId: msg.tenantId, systemId: msg.systemId, 'driverConfig.deviceId': msg.deviceId },
      { $set: { lastTelemetryAt: latestDoc.receivedAt, updatedAt: latestDoc.receivedAt } },
    );
  }

  return {
    tenantId: msg.tenantId,
    deviceId: msg.deviceId,
    tagCount: historyDoc.tagCount,
    slim: true,
  };
}

module.exports = {
  storeSlimTelemetry,
  LATEST,
  HISTORY,
  REGISTRY,
};
