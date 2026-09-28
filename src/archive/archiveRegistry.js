'use strict';

const { MongoClient } = require('mongodb');

const REGISTRY = 'archive_registry';

let client = null;
let col = null;
let connecting = null;

function uri() {
  return process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

function dbName() {
  return process.env.MONGODB_DB || 'peaklogic';
}

async function connect() {
  if (col) return col;
  if (connecting) return connecting;
  const u = uri();
  if (!u) throw new Error('MONGODB_URI required for archive registry');

  connecting = (async () => {
    client = new MongoClient(u, { maxPoolSize: 4 });
    await client.connect();
    col = client.db(dbName()).collection(REGISTRY);
    await col.createIndex({ company: 1, siteId: 1, periodStart: 1 }, { unique: true });
    await col.createIndex({ sha256: 1 });
    await col.createIndex({ status: 1, compactedAt: -1 });
    return col;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function upsertVerified(entry) {
  const collection = await connect();
  const now = new Date();
  const doc = {
    company: entry.company,
    siteId: entry.siteId,
    periodStart: entry.periodStart instanceof Date ? entry.periodStart : new Date(entry.periodStart),
    periodEnd: entry.periodEnd instanceof Date ? entry.periodEnd : new Date(entry.periodEnd),
    blobPath: entry.blobPath,
    indexPath: entry.indexPath,
    codec: entry.codec || 'zstd',
    byteSize: entry.byteSize,
    recordCount: entry.recordCount,
    sha256: entry.sha256,
    status: 'verified',
    compactedAt: now,
    updatedAt: now,
  };

  await collection.updateOne(
    { company: doc.company, siteId: doc.siteId, periodStart: doc.periodStart },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );

  return doc;
}

async function findByRange({ company, siteId, from, to }) {
  const collection = await connect();
  return collection.find({
    company,
    siteId,
    periodStart: { $gte: new Date(from), $lt: new Date(to) },
    status: 'verified',
  }).sort({ periodStart: 1 }).toArray();
}

async function close() {
  if (client) await client.close();
  client = null;
  col = null;
}

module.exports = {
  REGISTRY,
  connect,
  upsertVerified,
  findByRange,
  close,
};
