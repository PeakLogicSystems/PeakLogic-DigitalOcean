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

  await db.collection(LATEST).updateOne(
    { tenantId: msg.tenantId, deviceId: msg.deviceId },
    { $set: latestDoc },
    { upsert: true },
  );

  await db.collection(HISTORY).insertOne(historyDoc);

  await db.collection(REGISTRY).updateOne(
    { tenantId: msg.tenantId, deviceId: msg.deviceId },
    {
      $set: {
        tenantId: registry.tenantId,
        deviceId: registry.deviceId,
        name: registry.name,
        platform: registry.platform,
        online: registry.online,
        lastSeenAt: registry.lastSeenAt,
        lastReport: registry.lastReport,
        updatedAt: registry.updatedAt,
      },
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
