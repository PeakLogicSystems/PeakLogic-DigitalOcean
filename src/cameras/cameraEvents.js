'use strict';

const mongo = require('../logger/mongoTagLogger');

const COLLECTION = 'camera_events';

async function eventsCollection() {
  const db = await mongo.getDb();
  if (!db) return null;
  const col = db.collection(COLLECTION);
  await col.createIndex({ cameraId: 1, at: -1 });
  await col.createIndex({ type: 1, at: -1 });
  return col;
}

async function logEvent({ cameraId, type, message = '', snapshotId = null, meta = {} }) {
  const col = await eventsCollection();
  if (!col) return null;
  const doc = {
    cameraId: String(cameraId || '').trim(),
    type: String(type || 'info').trim(),
    message: String(message || '').trim(),
    snapshotId: snapshotId ? String(snapshotId) : null,
    meta: meta && typeof meta === 'object' ? meta : {},
    at: new Date(),
  };
  const result = await col.insertOne(doc);
  return { eventId: result.insertedId.toString(), ...doc };
}

async function queryEvents(cameraId, { limit = 100, since = null, type = null } = {}) {
  const col = await eventsCollection();
  if (!col) return [];
  const q = {};
  if (cameraId) q.cameraId = String(cameraId);
  if (type) q.type = String(type);
  if (since) q.at = { $gte: since instanceof Date ? since : new Date(since) };
  const rows = await col.find(q).sort({ at: -1 }).limit(Math.min(limit, 500)).toArray();
  return rows.map((r) => ({
    eventId: r._id.toString(),
    cameraId: r.cameraId,
    type: r.type,
    message: r.message,
    snapshotId: r.snapshotId,
    meta: r.meta || {},
    at: r.at,
  }));
}

module.exports = {
  COLLECTION,
  logEvent,
  queryEvents,
};
