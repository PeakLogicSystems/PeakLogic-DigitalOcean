'use strict';

const { DEFAULT_MQTT_PARC_BROKER } = require('../config');

/** @typedef {import('../integrations/cmmsAlarmPublisher').CmmsIntegrationConfig} CmmsIntegrationConfig */

const SCHEMA = 'peaklogic-cmms-integration-v1';

const DEFAULT_CMMS_INTEGRATION = {
  enabled: false,
  brokerUrl: DEFAULT_MQTT_PARC_BROKER || 'mqtt://127.0.0.1:1883',
  topicPrefix: 'peaklogic/v1',
  siteId: 'local',
  tenantId: 'local',
  clientId: 'peaklogic-cmms',
  username: '',
  password: '',
  qos: 1,
  publishAlarmTopic: true,
  publishNotifyTopic: true,
};

function normalizeCmmsIntegration(input, prev = {}) {
  const base = { ...DEFAULT_CMMS_INTEGRATION, ...(prev && typeof prev === 'object' ? prev : {}) };
  if (input === null) return { ...DEFAULT_CMMS_INTEGRATION, enabled: false };
  if (input === undefined) return base;
  if (typeof input !== 'object') return base;

  const qos = Number(input.qos);
  return {
    enabled: input.enabled === true,
    brokerUrl: String(input.brokerUrl ?? base.brokerUrl).trim() || DEFAULT_CMMS_INTEGRATION.brokerUrl,
    topicPrefix: String(input.topicPrefix ?? base.topicPrefix).trim().replace(/\/+$/, '') || 'peaklogic/v1',
    siteId: String(input.siteId ?? base.siteId).trim() || 'local',
    tenantId: String(input.tenantId ?? base.tenantId).trim() || 'local',
    clientId: String(input.clientId ?? base.clientId).trim() || 'peaklogic-cmms',
    username: String(input.username ?? base.username ?? '').trim(),
    password: String(input.password ?? base.password ?? ''),
    qos: Number.isFinite(qos) && qos >= 0 && qos <= 2 ? qos : 1,
    publishAlarmTopic: input.publishAlarmTopic !== false,
    publishNotifyTopic: input.publishNotifyTopic !== false,
  };
}

module.exports = {
  SCHEMA,
  DEFAULT_CMMS_INTEGRATION,
  normalizeCmmsIntegration,
};
