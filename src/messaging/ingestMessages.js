'use strict';

const SCHEMA = 'peaklogic-parc-ingest-v1';

/**
 * Envelope for parc-ingest Service Bus queue (edge telemetry uplink).
 * @param {{ tenantId: string, deviceId: string, report: object, gatewayId?: string, systemId?: string }} input
 */
function buildParcIngestEnvelope(input) {
  const tenantId = String(input.tenantId || '').trim();
  const deviceId = String(input.deviceId || input.report?.deviceId || '').trim();
  if (!tenantId) throw new Error('tenantId is required');
  if (!deviceId) throw new Error('deviceId is required');
  if (!input.report || typeof input.report !== 'object') {
    throw new Error('report object is required');
  }

  return {
    schema: SCHEMA,
    type: 'parc:telemetry',
    publishedAt: new Date().toISOString(),
    tenantId,
    deviceId,
    gatewayId: input.gatewayId ? String(input.gatewayId) : null,
    systemId: input.systemId ? String(input.systemId) : null,
    report: {
      ...input.report,
      deviceId,
    },
  };
}

function isParcIngestMessage(body) {
  return Boolean(
    body
    && (body.type === 'parc:telemetry' || body.schema === SCHEMA)
    && body.tenantId
    && body.deviceId
    && body.report,
  );
}

module.exports = {
  SCHEMA,
  buildParcIngestEnvelope,
  isParcIngestMessage,
};
