'use strict';

const { MongoClient } = require('mongodb');
const {
  archiveRelativePath,
  dayBoundsUtc,
  defaultCompactDayKey,
  parsePartitionKey,
  resolveCompany,
  resolveSiteId,
} = require('./archivePaths');
const { putArchive, verifyArchive, archiveEnabled } = require('./archiveClient');
const { upsertVerified, close: closeRegistry } = require('./archiveRegistry');
const { buildHourlyZstdBlob } = require('./zstdWriter');

function collectionName() {
  return process.env.MONGODB_COLLECTION || 'tag_logs';
}

function dbName() {
  return process.env.MONGODB_DB || 'peaklogic';
}

function uri() {
  return process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

function dryRun() {
  return process.env.ARCHIVE_COMPACT_DRY_RUN === '1';
}

async function connectMongo() {
  const u = uri();
  if (!u) throw new Error('MONGODB_URI required');
  const client = new MongoClient(u, { maxPoolSize: 4 });
  await client.connect();
  const col = client.db(dbName()).collection(collectionName());
  return { client, col };
}

async function listPartitions(col, periodStart, periodEnd) {
  const rows = await col.aggregate([
    {
      $match: {
        event: 'pen_sample',
        at: { $gte: periodStart, $lt: periodEnd },
      },
    },
    {
      $project: {
        company: 1,
        siteId: 1,
        deviceId: 1,
        projectName: 1,
        tag: 1,
      },
    },
  ]).toArray();

  const keys = new Set();
  for (const doc of rows) {
    keys.add(`${resolveCompany(doc)}\0${resolveSiteId(doc)}`);
  }
  return [...keys];
}

async function streamPartitionDocs(col, partitionKey, periodStart, periodEnd) {
  const { company, siteId } = parsePartitionKey(partitionKey);

  const cursor = col.find({
    event: 'pen_sample',
    at: { $gte: periodStart, $lt: periodEnd },
    $or: [
      { company, siteId },
      { company, siteId: { $exists: false }, deviceId: siteId },
      { company: { $exists: false }, projectName: siteId },
    ],
  }).sort({ at: 1 });

  async function* gen() {
    for await (const doc of cursor) {
      const co = resolveCompany(doc);
      const sid = resolveSiteId(doc);
      if (co !== company || sid !== siteId) continue;
      yield doc;
    }
  }

  return gen();
}

async function compactPartition(col, partitionKey, dayKey, periodStart, periodEnd) {
  const { company, siteId } = parsePartitionKey(partitionKey);
  const blobPath = archiveRelativePath({ company, siteId, dayKey, ext: 'blob' });
  const indexPath = archiveRelativePath({ company, siteId, dayKey, ext: 'index' });

  const docs = await streamPartitionDocs(col, partitionKey, periodStart, periodEnd);
  const { blob, index, recordCount, exportedIds } = await buildHourlyZstdBlob(docs, {
    company,
    siteId,
    periodStart,
    periodEnd,
    blobPath,
  });

  if (recordCount === 0) {
    return { skipped: true, company, siteId, reason: 'no_records' };
  }

  index.indexPath = indexPath;

  if (dryRun()) {
    return {
      dryRun: true,
      company,
      siteId,
      recordCount,
      byteSize: blob.length,
      blobPath,
      indexPath,
      sha256: index.sha256,
    };
  }

  if (!archiveEnabled()) {
    throw new Error('ARCHIVE_SERVER_URL not set');
  }

  await putArchive(blobPath, blob);
  await putArchive(indexPath, JSON.stringify(index, null, 2), {
    contentType: 'application/json',
  });
  await verifyArchive(blobPath, index.sha256, blob.length);

  await upsertVerified({
    company,
    siteId,
    periodStart,
    periodEnd,
    blobPath,
    indexPath,
    codec: index.codec,
    byteSize: blob.length,
    recordCount,
    sha256: index.sha256,
  });

  const del = exportedIds.length
    ? await col.deleteMany({ _id: { $in: exportedIds } })
    : { deletedCount: 0 };

  return {
    ok: true,
    company,
    siteId,
    recordCount,
    byteSize: blob.length,
    blobPath,
    indexPath,
    deleted: del.deletedCount,
  };
}

/**
 * Run daily compaction for calendar day `dayKey` (default: today − 7 UTC).
 */
async function runCompactJob(options = {}) {
  const dayKey = options.dayKey || defaultCompactDayKey(options.now);
  const { periodStart, periodEnd } = dayBoundsUtc(dayKey);

  const { client, col } = await connectMongo();
  const results = [];
  const errors = [];

  try {
    const partitions = await listPartitions(col, periodStart, periodEnd);
    for (const pk of partitions) {
      try {
        const r = await compactPartition(col, pk, dayKey, periodStart, periodEnd);
        results.push(r);
      } catch (e) {
        errors.push({ partition: pk, error: e.message || String(e) });
      }
    }

    return {
      ok: errors.length === 0,
      dayKey,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      partitions: partitions.length,
      results,
      errors,
      dryRun: dryRun(),
    };
  } finally {
    await client.close();
    await closeRegistry().catch(() => {});
  }
}

module.exports = {
  runCompactJob,
  compactPartition,
  listPartitions,
};
