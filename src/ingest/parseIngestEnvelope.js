'use strict';

const SCHEMA = 'peaklogic-parc-ingest-v1';

/**
 * Normalize Event Hub / Service Bus / HTTP body to ingest envelope.
 * @param {object|string|Buffer} raw
 */
function parseIngestEnvelope(raw) {
  let body = raw;
  if (Buffer.isBuffer(body)) {
    body = JSON.parse(body.toString('utf8'));
  } else if (typeof body === 'string') {
    body = JSON.parse(body);
  }
  if (body?.body && body.body.tenantId) {
    body = body.body;
  }

  if (!body?.tenantId || !body?.deviceId) {
    throw new Error('Invalid ingest envelope — tenantId and deviceId required');
  }
  if (!body.report || typeof body.report !== 'object') {
    throw new Error('Invalid ingest envelope — report required');
  }

  return {
    schema: body.schema || SCHEMA,
    type: body.type || 'parc:telemetry',
    publishedAt: body.publishedAt || new Date().toISOString(),
    tenantId: String(body.tenantId).trim(),
    deviceId: String(body.deviceId).trim(),
    gatewayId: body.gatewayId ? String(body.gatewayId) : null,
    systemId: body.systemId ? String(body.systemId) : null,
    report: { ...body.report, deviceId: String(body.deviceId).trim() },
  };
}

module.exports = { parseIngestEnvelope };
