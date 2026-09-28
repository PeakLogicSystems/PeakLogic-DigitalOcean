'use strict';

const mongoTagLogger = require('../logger/mongoTagLogger');
const { registry } = require('./cameraRegistry');
const { logEvent } = require('./cameraEvents');
const { getTagStore } = require('./cameraAiHolder');
const httpBackend = require('./inference/httpBackend');
const stubBackend = require('./inference/stubBackend');

function aiSettings(settings = registry.settings()) {
  return settings;
}

function aiEnabled(settings = registry.settings()) {
  return settings.cameraAiEnabled !== false;
}

function pickBackend(settings) {
  const backend = String(settings.cameraAiBackend || 'stub').trim().toLowerCase();
  if (backend === 'http') return httpBackend;
  if (backend === 'off' || backend === 'none') return null;
  return stubBackend;
}

function assetIdForCamera(cameraId, settings) {
  const prefix = String(settings.cameraAiAssetPrefix || 'cam').trim() || 'cam';
  return `${prefix}:${cameraId}`;
}

async function runInferenceOnBuffer({
  cameraId,
  buffer,
  contentType = 'image/jpeg',
  source = 'manual',
  snapshotId = null,
  meta = {},
}) {
  const settings = aiSettings();
  if (!aiEnabled(settings)) {
    return { skipped: true, reason: 'camera AI disabled' };
  }
  const backend = pickBackend(settings);
  if (!backend) {
    return { skipped: true, reason: 'camera AI backend off' };
  }

  const rec = registry.getCameraRecord(cameraId);
  const result = await backend.inferImage({
    buffer,
    contentType,
    cameraId,
    source,
    snapshotId,
    settings,
  });

  const inferenceDoc = {
    at: new Date(),
    cameraId,
    assetId: assetIdForCamera(cameraId, settings),
    deviceId: cameraId,
    modelId: result.modelId || settings.cameraAiModelId || 'camera-vision',
    source,
    snapshotId,
    inference: {
      type: result.type || 'vision',
      score: result.score,
      label: result.label,
      confidence: result.confidence,
    },
    features: {
      ...(result.features || {}),
      cameraId,
      snapshotId,
      source,
      host: rec?.host || '',
      ...meta,
    },
  };

  const logged = await mongoTagLogger.logEdgeInferences([inferenceDoc]);

  await logEvent({
    cameraId,
    type: 'inference',
    message: `${result.label || 'inference'} score=${result.score}`,
    snapshotId,
    meta: {
      source,
      modelId: inferenceDoc.modelId,
      score: result.score,
      label: result.label,
    },
  });

  const threshold = Number(settings.cameraAiAlarmThreshold);
  const alarmTagId = String(settings.cameraAiAlarmTagId || '').trim();
  if (
    alarmTagId
    && Number.isFinite(threshold)
    && result.score != null
    && result.score >= threshold
  ) {
    const tagStore = getTagStore();
    if (tagStore?.setValue) {
      try {
        tagStore.setValue(alarmTagId, true);
        await logEvent({
          cameraId,
          type: 'inference_alarm',
          message: `Alarm threshold ${threshold} exceeded (score=${result.score})`,
          snapshotId,
          meta: { alarmTagId, score: result.score, label: result.label },
        });
      } catch (e) {
        console.warn('[camera-ai] alarm tag write:', e.message || e);
      }
    }
  }

  return {
    ok: true,
    inference: result,
    logged,
    snapshotId,
    source,
  };
}

async function inferAfterCapture(captureResult, source = 'post_capture') {
  if (!captureResult?.fileId || !captureResult?.cameraId) return { skipped: true };
  const settings = aiSettings();
  if (!aiEnabled(settings) || settings.cameraAiPostCaptureEnabled === false) {
    return { skipped: true, reason: 'post-capture AI disabled' };
  }
  try {
    const gridfs = require('../storage/gridfsStore');
    const buffer = await gridfs.readBuffer(gridfs.BUCKETS.camera_snapshots, captureResult.fileId);
    return runInferenceOnBuffer({
      cameraId: captureResult.cameraId,
      buffer,
      contentType: captureResult.contentType || 'image/jpeg',
      source,
      snapshotId: captureResult.fileId,
      meta: { reason: captureResult.reason },
    });
  } catch (e) {
    await logEvent({
      cameraId: captureResult.cameraId,
      type: 'error',
      message: `Post-capture inference failed: ${e.message || String(e)}`,
      snapshotId: captureResult.fileId,
    }).catch(() => {});
    return { ok: false, error: e.message || String(e) };
  }
}

async function inferLiveCamera(cameraId) {
  const settings = aiSettings();
  if (!aiEnabled(settings) || settings.cameraAiLiveEnabled === false) {
    return { skipped: true, reason: 'live AI disabled' };
  }
  const { fetchFrameJpeg } = require('./go2rtcClient');
  const go2rtc = require('./go2rtcManager');
  const rec = registry.getCameraRecord(cameraId);
  if (!rec?.rtspUrl) return { skipped: true, reason: 'no rtsp' };
  try {
    await go2rtc.ensureRunning(settings);
    const frame = await fetchFrameJpeg(cameraId, settings);
    return runInferenceOnBuffer({
      cameraId,
      buffer: frame.buffer,
      contentType: frame.contentType || 'image/jpeg',
      source: 'live_edge',
      meta: { host: rec.host },
    });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function inferOnMotion(cameraId) {
  const settings = aiSettings();
  if (!aiEnabled(settings) || settings.cameraAiMotionEnabled === false) {
    return { skipped: true, reason: 'motion AI disabled' };
  }
  const { captureAndStore } = require('./cameraSnapshotService');
  try {
    const shot = await captureAndStore(cameraId, { reason: 'motion' });
    return inferAfterCapture(shot, 'motion');
  } catch (e) {
    await logEvent({
      cameraId,
      type: 'error',
      message: `Motion-triggered capture/infer failed: ${e.message || String(e)}`,
    }).catch(() => {});
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  aiEnabled,
  aiSettings,
  runInferenceOnBuffer,
  inferAfterCapture,
  inferLiveCamera,
  inferOnMotion,
  assetIdForCamera,
};
