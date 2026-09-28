'use strict';

/**
 * Appliance → cloud uplink for Parc telemetry (appliance acts as remote edge to mv-cloud).
 */

const mqtt = require('mqtt');
const persistence = require('../persistence');
const { normalizeCloudRemote, isCloudRemoteActive } = require('../settings/cloudRemoteSettings');
const { cloudTopics } = require('../parc/cloudMqttTopics');

let client = null;
let connecting = null;
let config = normalizeCloudRemote(null, {});

function loadConfigFromDisk() {
  const settings = persistence.readJson('settings.json', {});
  config = normalizeCloudRemote(settings.cloudRemote, config);
  return config;
}

function reloadConfig(next) {
  config = normalizeCloudRemote(next, config);
  if (client?.connected) {
    client.end(true);
    client = null;
    connecting = null;
  }
  return config;
}

function mqttOptions(cfg) {
  const opts = {
    clientId: cfg.clientId || `mv-appliance-${cfg.gatewayId || 'remote'}`,
    reconnectPeriod: 5000,
    keepalive: 60,
  };
  if (cfg.username) opts.username = cfg.username;
  if (cfg.password) opts.password = cfg.password;
  return opts;
}

async function ensureConnected(cfg = config) {
  if (!isCloudRemoteActive(cfg)) return null;
  if (client?.connected) return client;
  if (connecting) return connecting;

  connecting = new Promise((resolve, reject) => {
    const c = mqtt.connect(cfg.brokerUrl, mqttOptions(cfg));
    const onConnect = () => {
      cleanup();
      client = c;
      connecting = null;
      resolve(c);
    };
    const onError = (err) => {
      cleanup();
      connecting = null;
      client = null;
      reject(err);
    };
    const cleanup = () => {
      c.off('connect', onConnect);
      c.off('error', onError);
    };
    c.once('connect', onConnect);
    c.once('error', onError);
  });

  return connecting;
}

function enrichReportForCloud(report, cfg = config) {
  let cellular = report.meta?.cellular || null;
  try {
    const { registry } = require('../parc/deviceRegistry');
    const dev = report?.deviceId ? registry.getDevice(report.deviceId) : null;
    if (dev?.meta?.cellular) cellular = dev.meta.cellular;
  } catch { /* optional */ }

  return {
    ...report,
    meta: {
      ...(report.meta || {}),
      tenantId: cfg.tenantId,
      siteId: cfg.siteId,
      gatewayId: cfg.gatewayId,
      applianceId: cfg.applianceId || cfg.gatewayId,
      locationSlug: cfg.locationSlug,
      systemSlug: cfg.systemSlug,
      relayedAt: new Date().toISOString(),
      source: 'peaklogic-appliance',
      ...(cellular ? { cellular } : {}),
    },
    ...(cellular ? {
      registration: {
        deviceId: report.deviceId,
        gatewayId: cellular.gatewayId || cfg.gatewayId || null,
        cellular,
      },
    } : {}),
  };
}

function publishJson(topic, payload, cfg = config) {
  return new Promise((resolve, reject) => {
    if (!client?.connected) {
      reject(new Error('Cloud MQTT not connected'));
      return;
    }
    const body = JSON.stringify(payload);
    client.publish(topic, body, { qos: cfg.qos }, (err) => {
      if (err) reject(err);
      else resolve({ topic, bytes: body.length });
    });
  });
}

/**
 * Relay a local Parc report to tenant-scoped MQTT topics (cloud ingest).
 * @param {object} report — local Parc telemetry body
 */
async function relayParcReportIfEnabled(report) {
  const cfg = loadConfigFromDisk();
  if (!isCloudRemoteActive(cfg)) return { relayed: false, skipped: 'disabled' };
  if (!report?.deviceId) return { relayed: false, skipped: 'no deviceId' };

  const enriched = enrichReportForCloud(report, cfg);
  try {
    await ensureConnected(cfg);
  } catch (err) {
    console.warn('[cloud-remote] connect:', err.message || err);
    return { relayed: false, error: err.message || String(err) };
  }

  const t = cloudTopics(cfg, cfg.tenantId, enriched.deviceId);
  try {
    await publishJson(t.telemetry, enriched, cfg);
    await publishJson(t.online, {
      deviceId: enriched.deviceId,
      online: true,
      gatewayId: cfg.gatewayId,
      tenantId: cfg.tenantId,
    }, cfg);
    return { relayed: true, topic: t.telemetry };
  } catch (err) {
    console.warn('[cloud-remote] publish:', err.message || err);
    return { relayed: false, error: err.message || String(err) };
  }
}

function status() {
  const cfg = loadConfigFromDisk();
  return {
    enabled: cfg.enabled,
    active: isCloudRemoteActive(cfg),
    connected: !!client?.connected,
    brokerUrl: cfg.brokerUrl,
    tenantId: cfg.tenantId,
    tenantSlug: cfg.tenantSlug,
    siteId: cfg.siteId,
    gatewayId: cfg.gatewayId,
    relayParc: cfg.relayParc,
  };
}

module.exports = {
  loadConfigFromDisk,
  reloadConfig,
  enrichReportForCloud,
  relayParcReportIfEnabled,
  status,
  isCloudRemoteActive,
};
