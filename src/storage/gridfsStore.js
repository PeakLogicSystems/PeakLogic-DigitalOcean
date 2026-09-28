'use strict';

const { GridFSBucket, ObjectId } = require('mongodb');
const mongo = require('../logger/mongoTagLogger');

const BUCKETS = {
  camera_snapshots: 'camera_snapshots',
  hmi_assets: 'hmi_assets',
  project_bundles: 'project_bundles',
  report_pdfs: 'report_pdfs',
};

function parseObjectId(id) {
  const s = String(id || '').trim();
  if (!ObjectId.isValid(s)) {
    throw Object.assign(new Error('Invalid GridFS file id'), { status: 400 });
  }
  return new ObjectId(s);
}

async function enabled() {
  return mongo.enabled() && !!(await mongo.getDb());
}

async function status() {
  const ok = await enabled();
  return {
    enabled: mongo.enabled(),
    connected: ok,
    buckets: Object.values(BUCKETS),
  };
}

async function bucket(bucketName) {
  const db = await mongo.getDb();
  if (!db) {
    throw Object.assign(new Error('MongoDB not connected — configure mongoLogger.uri in settings'), { status: 503 });
  }
  const name = String(bucketName || '').trim();
  if (!name) throw Object.assign(new Error('bucket name required'), { status: 400 });
  return new GridFSBucket(db, { bucketName: name });
}

async function upload(bucketName, buffer, { filename, contentType, metadata = {} } = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('buffer required'), { status: 400 });
  }
  const fname = String(filename || `file_${Date.now()}`).trim();
  const b = await bucket(bucketName);
  return new Promise((resolve, reject) => {
    const stream = b.openUploadStream(fname, {
      contentType: contentType || 'application/octet-stream',
      metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      },
    });
    stream.on('error', reject);
    stream.on('finish', () => {
      resolve({
        fileId: stream.id.toString(),
        filename: fname,
        bucket: bucketName,
        length: buffer.length,
        contentType: contentType || 'application/octet-stream',
      });
    });
    stream.end(buffer);
  });
}

async function openDownloadStream(bucketName, fileId) {
  const b = await bucket(bucketName);
  return b.openDownloadStream(parseObjectId(fileId));
}

async function readBuffer(bucketName, fileId) {
  const stream = await openDownloadStream(bucketName, fileId);
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function deleteFile(bucketName, fileId) {
  const b = await bucket(bucketName);
  await b.delete(parseObjectId(fileId));
  return { ok: true, fileId: String(fileId) };
}

async function findFiles(bucketName, query = {}, { limit = 100, sort = { uploadDate: -1 } } = {}) {
  const db = await mongo.getDb();
  if (!db) return [];
  const col = db.collection(`${bucketName}.files`);
  return col.find(query).sort(sort).limit(limit).toArray();
}

async function findOneFile(bucketName, query = {}) {
  const files = await findFiles(bucketName, query, { limit: 1 });
  return files[0] || null;
}

function fileSummary(doc) {
  if (!doc) return null;
  return {
    fileId: doc._id.toString(),
    filename: doc.filename,
    length: doc.length,
    contentType: doc.contentType || doc.metadata?.contentType || '',
    uploadDate: doc.uploadDate,
    metadata: doc.metadata || {},
  };
}

async function listSummaries(bucketName, query = {}, opts = {}) {
  const files = await findFiles(bucketName, query, opts);
  return files.map(fileSummary);
}

async function purgeOlderThan(bucketName, ms, metadataFilter = {}) {
  const cutoff = new Date(Date.now() - ms);
  const files = await findFiles(bucketName, {
    uploadDate: { $lt: cutoff },
    ...metadataFilter,
  }, { limit: 5000 });
  let deleted = 0;
  for (const f of files) {
    try {
      await deleteFile(bucketName, f._id.toString());
      deleted += 1;
    } catch { /* ignore */ }
  }
  return { deleted, cutoff: cutoff.toISOString() };
}

module.exports = {
  BUCKETS,
  enabled,
  status,
  upload,
  openDownloadStream,
  readBuffer,
  deleteFile,
  findFiles,
  findOneFile,
  fileSummary,
  listSummaries,
  purgeOlderThan,
};
