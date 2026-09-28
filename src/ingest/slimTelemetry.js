'use strict';

/** Default operational retention in DocumentDB (full payloads live in datalake). */
const DEFAULT_TTL_DAYS = Number(process.env.TELEMETRY_TTL_DAYS) || 7;

/**
 * Slim tag row for 7-day operational history (full report stays in datalake).
 * @param {object} tag
 */
function slimTag(tag) {
  if (!tag?.id) return null;
  return {
    id: String(tag.id),
    v: tag.value,
    q: tag.quality || 'good',
    ...(tag.type ? { t: tag.type } : {}),
  };
}

/**
 * Build slim latest document (small full snapshot for UI).
 * @param {object} msg — ingest envelope
 */
function buildLatestDoc(msg) {
  const report = msg.report || {};
  const tags = Array.isArray(report.tags) ? report.tags : [];
  const ts = new Date();

  return {
    tenantId: msg.tenantId,
    deviceId: msg.deviceId,
    gatewayId: msg.gatewayId || report.meta?.gatewayId || null,
    systemId: msg.systemId || null,
    name: report.name || msg.deviceId,
    platform: report.platform || null,
    firmwareVersion: report.firmwareVersion || null,
    protocolVersion: report.protocolVersion ?? null,
    mqttBufferBytes: report.mqttBufferBytes ?? null,
    runtime: report.runtime || null,
    tagCount: tags.length,
    tags: tags.map((t) => ({
      id: String(t.id),
      type: t.type || 'REAL',
      value: t.value,
      quality: t.quality || 'good',
    })),
    receivedAt: ts,
    publishedAt: msg.publishedAt || ts.toISOString(),
  };
}

/**
 * Build slim history row (changed-tag friendly; no driverHealth/meta bloat).
 * @param {object} msg
 */
function buildHistoryDoc(msg) {
  const report = msg.report || {};
  const tags = Array.isArray(report.tags) ? report.tags.map(slimTag).filter(Boolean) : [];
  const ts = new Date();

  return {
    tenantId: msg.tenantId,
    deviceId: msg.deviceId,
    tags,
    tagCount: tags.length,
    runtime: report.runtime?.running != null ? { running: !!report.runtime.running } : undefined,
    ingestedAt: ts,
    publishedAt: msg.publishedAt || ts.toISOString(),
  };
}

/**
 * Registry heartbeat (minimal).
 * @param {object} msg
 */
function buildRegistryUpdate(msg) {
  const report = msg.report || {};
  const tags = Array.isArray(report.tags) ? report.tags : [];
  const ts = new Date();

  return {
    tenantId: msg.tenantId,
    deviceId: msg.deviceId,
    name: report.name || msg.deviceId,
    platform: report.platform || null,
    firmwareVersion: report.firmwareVersion || null,
    online: true,
    lastSeenAt: ts,
    lastReport: {
      tagCount: tags.length,
      publishedAt: msg.publishedAt || ts.toISOString(),
    },
    updatedAt: ts,
    createdAt: ts,
  };
}

function ttlSeconds(days = DEFAULT_TTL_DAYS) {
  return Math.max(1, days) * 86400;
}

module.exports = {
  DEFAULT_TTL_DAYS,
  slimTag,
  buildLatestDoc,
  buildHistoryDoc,
  buildRegistryUpdate,
  ttlSeconds,
};
