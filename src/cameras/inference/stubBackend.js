'use strict';

const crypto = require('crypto');

/**
 * Deterministic stub for dev/test — no external model required.
 * Score derived from image bytes so repeated frames differ slightly.
 */
async function inferImage({ buffer, cameraId, source, snapshotId, settings }) {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  const n = hash.readUInt16BE(0) / 65535;
  const score = Math.round(n * 1000) / 1000;
  const labels = ['normal', 'motion', 'person', 'vehicle', 'anomaly'];
  const label = score > 0.85 ? 'anomaly' : labels[hash[2] % labels.length];
  return {
    modelId: settings?.cameraAiModelId || 'stub-vision',
    score,
    label,
    confidence: Math.round((0.5 + n * 0.5) * 1000) / 1000,
    type: 'vision',
    features: { stub: true, byteLength: buffer.length },
    boxes: [],
  };
}

module.exports = { inferImage };
