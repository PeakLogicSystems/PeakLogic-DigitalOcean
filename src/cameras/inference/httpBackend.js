'use strict';

const http = require('http');
const https = require('https');

function postJson(url, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Accept: 'application/json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(Object.assign(new Error(`Inference HTTP ${res.statusCode}: ${text.slice(0, 200)}`), {
            status: res.statusCode,
          }));
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch (e) {
          reject(new Error(`Inference response not JSON: ${e.message}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Inference request timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function normalizeResponse(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const score = raw.score ?? raw.inference?.score ?? raw.anomaly_score;
  const label = raw.label ?? raw.inference?.label ?? raw.class ?? raw.prediction;
  const confidence = raw.confidence ?? raw.inference?.confidence ?? raw.probability;
  if (score == null && !label) return null;
  return {
    modelId: raw.modelId || raw.model || defaults.modelId || 'http-vision',
    score: score != null ? Number(score) : null,
    label: label != null ? String(label) : null,
    confidence: confidence != null ? Number(confidence) : null,
    type: raw.type || raw.inference?.type || 'vision',
    features: raw.features && typeof raw.features === 'object' ? raw.features : {},
    boxes: Array.isArray(raw.boxes) ? raw.boxes : (Array.isArray(raw.detections) ? raw.detections : []),
  };
}

/**
 * POST { cameraId, source, snapshotId, contentType, imageBase64 } to configured URL.
 * Service should return { score, label, confidence, modelId?, boxes?, features? }.
 */
async function inferImage({ buffer, contentType, cameraId, source, snapshotId, settings }) {
  const url = String(settings?.cameraAiHttpUrl || '').trim();
  if (!url) {
    throw Object.assign(new Error('cameraAiHttpUrl not configured'), { status: 400 });
  }
  const body = {
    cameraId,
    source: source || 'unknown',
    snapshotId: snapshotId || null,
    contentType: contentType || 'image/jpeg',
    imageBase64: buffer.toString('base64'),
  };
  const raw = await postJson(url, body, Number(settings.cameraAiTimeoutMs) || 30000);
  const norm = normalizeResponse(raw, { modelId: settings.cameraAiModelId });
  if (!norm) throw new Error('Inference service returned no score or label');
  return norm;
}

module.exports = {
  inferImage,
  normalizeResponse,
  postJson,
};
