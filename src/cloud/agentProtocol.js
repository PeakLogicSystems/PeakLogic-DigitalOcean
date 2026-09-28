'use strict';

/**
 * Appliance ↔ SaaS site-agent WebSocket protocol (control channel).
 * Credentials (camera passwords) never appear in these messages.
 */

const MSG = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat_ack',
  INVENTORY: 'inventory',
  INVENTORY_ACK: 'inventory_ack',
  VIEWER_OPEN: 'viewer.open',
  VIEWER_CLOSE: 'viewer.close',
  VIEWER_READY: 'viewer.ready',
  VIEWER_ERROR: 'viewer.error',
  SNAPSHOT_PUSH: 'snapshot.push',
  SNAPSHOT_ACK: 'snapshot.ack',
  ERROR: 'error',
});

const PROTOCOL_VERSION = 1;

/** Redacted camera row safe to store in the cloud catalog. */
function redactCameraForCloud(cam, siteId) {
  if (!cam) return null;
  return {
    siteId: String(siteId || ''),
    cameraId: String(cam.cameraId || '').trim(),
    name: String(cam.name || cam.cameraId || '').trim(),
    host: String(cam.host || '').trim(),
    port: Number(cam.port) || 0,
    model: String(cam.model || '').trim(),
    manufacturer: String(cam.manufacturer || '').trim(),
    vendor: String(cam.vendor || '').trim(),
    probeStatus: String(cam.probeStatus || '').trim(),
    hasStream: !!(cam.hasStream || cam.rtspUrl),
    viewerPath: cam.cameraId
      ? `/api/sites/${encodeURIComponent(siteId)}/cameras/${encodeURIComponent(cam.cameraId)}/player`
      : '',
    lastSeenAt: cam.lastSeenAt || cam.probedAt || null,
    updatedAt: new Date().toISOString(),
  };
}

function parseMessage(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (Buffer.isBuffer(raw)) {
    try { obj = JSON.parse(raw.toString('utf8')); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const type = String(obj.type || '').trim();
  if (!type) return null;
  return { ...obj, type };
}

function encodeMessage(type, payload = {}) {
  return JSON.stringify({ type, v: PROTOCOL_VERSION, ...payload, ts: Date.now() });
}

function isCloudDeployment() {
  return process.env.PEAKLOGIC_DEPLOYMENT === 'cloud'
    || process.env.PEAKLOGIC_CLOUD_SITES === '1';
}

module.exports = {
  MSG,
  PROTOCOL_VERSION,
  redactCameraForCloud,
  parseMessage,
  encodeMessage,
  isCloudDeployment,
};
