'use strict';

const { DEFAULT_MQTT_PARC_BROKER, TENANT_ID } = require('../config');

const DEFAULT_CLOUD_REMOTE = {
  enabled: false,
  /** Cloud tenant UUID (from pairing). */
  tenantId: '',
  tenantSlug: '',
  /** Site / location slug in cloud hierarchy. */
  siteId: 'local',
  locationSlug: '',
  systemSlug: '',
  /** Stable appliance identity (UUID from pairing). */
  applianceId: '',
  gatewayId: '',
  /** Cloud registry device id (Mongo) for this appliance gateway. */
  gatewayDeviceId: '',
  brokerUrl: DEFAULT_MQTT_PARC_BROKER || 'mqtt://127.0.0.1:1883',
  topicPrefix: 'peaklogic/v1',
  clientId: 'peaklogic-appliance-remote',
  username: '',
  password: '',
  qos: 1,
  relayParc: true,
  relayAlarms: false,
  cloudApiUrl: '',
};

function normalizeCloudRemote(input, prev = {}) {
  const base = { ...DEFAULT_CLOUD_REMOTE, ...(prev && typeof prev === 'object' ? prev : {}) };
  if (input === null) return { ...DEFAULT_CLOUD_REMOTE, enabled: false };
  if (input === undefined) return base;
  if (typeof input !== 'object') return base;

  const qos = Number(input.qos);
  return {
    enabled: input.enabled === true,
    tenantId: String(input.tenantId ?? base.tenantId).trim(),
    tenantSlug: String(input.tenantSlug ?? base.tenantSlug).trim(),
    siteId: String(input.siteId ?? base.siteId).trim() || 'local',
    locationSlug: String(input.locationSlug ?? base.locationSlug).trim(),
    systemSlug: String(input.systemSlug ?? base.systemSlug).trim(),
    applianceId: String(input.applianceId ?? base.applianceId).trim(),
    gatewayId: String(input.gatewayId ?? input.applianceId ?? base.gatewayId).trim(),
    gatewayDeviceId: String(input.gatewayDeviceId ?? base.gatewayDeviceId).trim(),
    brokerUrl: String(input.brokerUrl ?? base.brokerUrl).trim() || DEFAULT_CLOUD_REMOTE.brokerUrl,
    topicPrefix: String(input.topicPrefix ?? base.topicPrefix).trim().replace(/\/+$/, '') || 'peaklogic/v1',
    clientId: String(input.clientId ?? base.clientId).trim() || 'peaklogic-appliance-remote',
    username: String(input.username ?? base.username ?? '').trim(),
    password: String(input.password ?? base.password ?? ''),
    qos: Number.isFinite(qos) && qos >= 0 && qos <= 2 ? qos : 1,
    relayParc: input.relayParc !== false,
    relayAlarms: input.relayAlarms === true,
    cloudApiUrl: String(input.cloudApiUrl ?? base.cloudApiUrl).trim(),
  };
}

/** True when appliance should uplink Parc telemetry to cloud tenant topics. */
function isCloudRemoteActive(cfg) {
  return cfg?.enabled === true
    && cfg.relayParc !== false
    && !!cfg.tenantId
    && !!cfg.gatewayId;
}

module.exports = {
  DEFAULT_CLOUD_REMOTE,
  normalizeCloudRemote,
  isCloudRemoteActive,
};
