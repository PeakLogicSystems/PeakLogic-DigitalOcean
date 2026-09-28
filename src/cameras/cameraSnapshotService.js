'use strict';

const { fetchSnapshot } = require('./onvifClient');
const { registry } = require('./cameraRegistry');
const gridfs = require('../storage/gridfsStore');
const { logEvent } = require('./cameraEvents');

const BUCKET = gridfs.BUCKETS.camera_snapshots;

function cameraCreds(rec, settings = {}) {
  return {
    username: rec.username || settings.defaultUsername || '',
    password: rec.password || settings.defaultPassword || '',
    timeoutMs: 12000,
  };
}

async function captureAndStore(cameraId, { reason = 'manual', tagId = null, meta = {} } = {}) {
  const rec = registry.getCameraRecord(cameraId);
  if (!rec) throw Object.assign(new Error('Camera not found'), { status: 404 });
  if (!rec.snapshotUrl) {
    throw Object.assign(new Error('Camera has no snapshot URL — run Probe first'), { status: 400 });
  }
  if (!(await gridfs.enabled())) {
    throw Object.assign(new Error('MongoDB GridFS not available — configure mongoLogger.uri'), { status: 503 });
  }

  const settings = registry.settings();
  const { buffer, contentType } = await fetchSnapshot(rec.snapshotUrl, cameraCreds(rec, settings));
  const ext = (contentType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const stored = await gridfs.upload(BUCKET, buffer, {
    filename: `${cameraId}_${Date.now()}.${ext}`,
    contentType: contentType || 'image/jpeg',
    metadata: {
      cameraId,
      reason: String(reason || 'manual'),
      tagId: tagId ? String(tagId) : null,
      host: rec.host || '',
      name: rec.name || cameraId,
      ...meta,
    },
  });

  await logEvent({
    cameraId,
    type: 'snapshot',
    message: `Snapshot captured (${reason})`,
    snapshotId: stored.fileId,
    meta: { reason, tagId, length: stored.length },
  });

  const captureResult = {
    ...stored,
    cameraId,
    reason,
    capturedAt: new Date().toISOString(),
  };

  if (settings.cameraAiEnabled !== false && settings.cameraAiPostCaptureEnabled !== false) {
    const { inferAfterCapture } = require('./cameraInference');
    inferAfterCapture(captureResult, reason === 'motion' ? 'motion' : 'post_capture').catch(() => {});
  }

  // Phase 2: notify Cloud Studio (metadata only — no credentials / binary).
  try {
    const siteAgent = require('../cloud/siteAgent');
    siteAgent.pushSnapshotMeta(cameraId, {
      reason: String(reason || 'manual'),
      fileId: stored.fileId,
      length: stored.length,
      at: captureResult.capturedAt,
    });
  } catch { /* agent optional */ }

  return captureResult;
}

async function listSnapshots(cameraId, { limit = 50 } = {}) {
  if (!(await gridfs.enabled())) return [];
  return gridfs.listSummaries(BUCKET, { 'metadata.cameraId': String(cameraId) }, { limit });
}

async function latestSnapshot(cameraId) {
  if (!(await gridfs.enabled())) return null;
  const file = await gridfs.findOneFile(BUCKET, { 'metadata.cameraId': String(cameraId) });
  return gridfs.fileSummary(file);
}

async function streamSnapshot(fileId, res) {
  const stream = await gridfs.openDownloadStream(BUCKET, fileId);
  stream.on('error', (err) => {
    if (!res.headersSent) res.status(404).json({ error: err.message });
    else res.end();
  });
  stream.pipe(res);
}

async function purgeRetention(settings = {}) {
  const days = Number(settings.snapshotRetentionDays) || 30;
  if (days <= 0) return { deleted: 0 };
  return gridfs.purgeOlderThan(BUCKET, days * 24 * 60 * 60 * 1000);
}

module.exports = {
  BUCKET,
  captureAndStore,
  listSnapshots,
  latestSnapshot,
  streamSnapshot,
  purgeRetention,
};
