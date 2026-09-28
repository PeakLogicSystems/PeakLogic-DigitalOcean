'use strict';

/**
 * PeakLogic CMMS Integration v1 — MQTT publisher (authoritative contract).
 *
 * Topics (siteId = settings.cmmsIntegration.siteId):
 *   {topicPrefix}/{siteId}/alarms         — alarm transition only
 *   {topicPrefix}/{siteId}/alarm-notify   — alarm + filtered notification recipients
 *
 * Alarm payload (alarms topic):
 * {
 *   schema: "peaklogic-cmms-integration-v1",
 *   publishedAt, siteId, tenantId, source: "peaklogic", projectName?,
 *   alarm: { tagId, level, previousLevel, value, since }
 * }
 *
 * Notify payload (alarm-notify topic): same + recipients: PublicUser[]
 * PublicUser: { id, email, role, active, profile, createdAt, updatedAt }
 */

const mqtt = require('mqtt');
const persistence = require('../persistence');
const userStore = require('../users/userStore');
const { resolveAlarmContext } = require('../alarms/alarmContext');
const { SCHEMA, normalizeCmmsIntegration } = require('../settings/cmmsIntegrationSettings');

let client = null;
let connecting = null;
let config = normalizeCmmsIntegration(null, {});

function topicAlarms(cfg = config) {
  return `${cfg.topicPrefix}/${cfg.siteId}/alarms`;
}

function topicAlarmNotify(cfg = config) {
  return `${cfg.topicPrefix}/${cfg.siteId}/alarm-notify`;
}

function projectNameFromSettings() {
  const settings = persistence.readJson('settings.json', {});
  return settings?.project?.name
    || persistence.readJson('workspace.est.json', {})?.project?.name
    || 'untitled';
}

/**
 * @param {{ tagId: string, level: string, previousLevel?: string|null, value?: *, since: number }} alarm
 * @param {object} opts
 */
function buildAlarmPayload(alarm, opts = {}) {
  const cfg = opts.config || config;
  return {
    schema: SCHEMA,
    publishedAt: new Date().toISOString(),
    siteId: cfg.siteId,
    tenantId: cfg.tenantId,
    source: 'peaklogic',
    projectName: opts.projectName ?? projectNameFromSettings(),
    alarm: {
      tagId: alarm.tagId,
      level: alarm.level,
      previousLevel: alarm.previousLevel ?? null,
      value: alarm.value ?? null,
      since: alarm.since,
    },
  };
}

/**
 * @param {{ tagId: string, level: string, previousLevel?: string|null, value?: *, since: number }} alarm
 * @param {object[]} recipients — PeakLogic publicUser rows
 * @param {object} opts
 */
function buildNotifyPayload(alarm, recipients, opts = {}) {
  return {
    ...buildAlarmPayload(alarm, opts),
    recipients: recipients || [],
  };
}

function loadConfigFromDisk() {
  const settings = persistence.readJson('settings.json', {});
  config = normalizeCmmsIntegration(settings.cmmsIntegration, config);
  return config;
}

function reloadConfig(next) {
  config = normalizeCmmsIntegration(next, config);
  if (client?.connected) {
    client.end(true);
    client = null;
    connecting = null;
  }
  return config;
}

function mqttOptions(cfg) {
  const opts = {
    clientId: cfg.clientId,
    reconnectPeriod: 5000,
    keepalive: 60,
  };
  if (cfg.username) opts.username = cfg.username;
  if (cfg.password) opts.password = cfg.password;
  return opts;
}

async function ensureConnected(cfg = config) {
  if (!cfg.enabled) return null;
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

function publishJson(topic, payload, cfg = config) {
  return new Promise((resolve, reject) => {
    if (!client?.connected) {
      reject(new Error('MQTT not connected'));
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
 * Publish alarm transition to CMMS MQTT topics.
 * @param {{ tagId: string, level: string, previousLevel?: string|null, value?: *, since: number }} evt
 */
async function publishAlarmTransition(evt) {
  const cfg = loadConfigFromDisk();
  if (!cfg.enabled) return { published: 0, skipped: 'disabled' };

  const alarmContext = resolveAlarmContext(evt);
  const recipients = userStore.listNotificationRecipients(evt.level, alarmContext);
  const alarmPayload = buildAlarmPayload(evt, { config: cfg });
  const notifyPayload = buildNotifyPayload(evt, recipients, { config: cfg });

  try {
    await ensureConnected(cfg);
  } catch (err) {
    console.warn('[cmms-mqtt] connect:', err.message || err);
    return { published: 0, error: err.message || String(err) };
  }

  const results = [];
  try {
    if (cfg.publishAlarmTopic) {
      results.push(await publishJson(topicAlarms(cfg), alarmPayload, cfg));
    }
    if (cfg.publishNotifyTopic) {
      results.push(await publishJson(topicAlarmNotify(cfg), notifyPayload, cfg));
    }
    console.log(
      `[cmms-mqtt] ${evt.tagId} ${evt.level} → ${results.map((r) => r.topic).join(', ')}`
      + ` (${recipients.length} recipient(s))`,
    );
    return { published: results.length, recipients: recipients.length, topics: results.map((r) => r.topic) };
  } catch (err) {
    console.warn('[cmms-mqtt] publish:', err.message || err);
    return { published: 0, error: err.message || String(err) };
  }
}

function status() {
  const cfg = loadConfigFromDisk();
  return {
    enabled: cfg.enabled,
    connected: !!client?.connected,
    brokerUrl: cfg.brokerUrl,
    siteId: cfg.siteId,
    topicAlarms: topicAlarms(cfg),
    topicAlarmNotify: topicAlarmNotify(cfg),
    schema: SCHEMA,
  };
}

module.exports = {
  SCHEMA,
  topicAlarms,
  topicAlarmNotify,
  buildAlarmPayload,
  buildNotifyPayload,
  reloadConfig,
  publishAlarmTransition,
  status,
};
