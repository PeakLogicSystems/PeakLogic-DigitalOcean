'use strict';

const { normalizeDeviceId, topicPrefix } = require('./mqttProtocol');

const TENANT_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function normalizeTenantId(id) {
  const s = String(id || '').trim();
  if (!s || !TENANT_ID_RE.test(s)) {
    throw new Error('tenantId must be 1-64 chars: letters, digits, . _ -');
  }
  return s;
}

/**
 * Tenant-scoped Parc topics for cloud ingest.
 * Local appliance hub uses mqttProtocol.topics(); uplink uses these.
 *
 * peaklogic/v1/{tenantId}/{deviceId}/telemetry
 */
function cloudTopics(cfg, tenantId, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const tenant = normalizeTenantId(tenantId);
  const base = `${topicPrefix(cfg)}/${tenant}/${id}`;
  return {
    telemetry: `${base}/telemetry`,
    online: `${base}/online`,
    config: `${base}/config`,
    cmd: `${base}/cmd`,
    cmdResponse: `${base}/cmd/response`,
    wildcardTelemetry: `${topicPrefix(cfg)}/${tenant}/+/telemetry`,
    tenantId: tenant,
    deviceId: id,
  };
}

module.exports = {
  normalizeTenantId,
  cloudTopics,
};
