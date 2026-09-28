'use strict';

const authService = require('../services/authService');
const { DEPLOYMENT_MODE } = require('../config');
const { isServiceBusConfigured, sendQueueMessage } = require('../messaging/serviceBus');
const { QUEUES } = require('../messaging/queues');
const {
  buildAlarmTransitionEnvelope,
  buildAlarmNotifyJob,
  buildCloudCmmsAlarmPayload,
  parseApplianceAlarmRelay,
} = require('../messaging/alarmMessages');

/** @type {Map<string, number>} */
const recentRelay = new Map();
const DEDUPE_MS = 30_000;

function dedupeHit(tenantId, alarm) {
  const key = `${tenantId}:${alarm.tagId}:${alarm.level}:${alarm.since}`;
  const now = Date.now();
  const prev = recentRelay.get(key);
  if (prev && now - prev < DEDUPE_MS) return true;
  recentRelay.set(key, now);
  if (recentRelay.size > 2000) {
    for (const [k, at] of recentRelay) {
      if (now - at > DEDUPE_MS) recentRelay.delete(k);
    }
  }
  return false;
}

/**
 * Deliver a relayed site alarm through cloud notification channels.
 * @param {string} tenantId
 * @param {object} alarm — { tagId, level, previousLevel?, value?, since? }
 * @param {object} [meta] — gateway/appliance metadata
 */
async function processCloudAlarmIngest(tenantId, alarm, meta = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid || !alarm?.tagId || !alarm?.level) {
    return { ok: false, error: 'tenantId, tagId, and level required' };
  }
  if (dedupeHit(tid, alarm)) {
    return { ok: true, path: 'deduped' };
  }

  const tenant = await authService.getTenantById(tid);
  if (!tenant) {
    return { ok: false, error: 'unknown tenant', status: 404 };
  }

  const payload = {
    tagId: String(alarm.tagId).trim(),
    level: String(alarm.level).trim(),
    previousLevel: alarm.previousLevel ?? null,
    value: alarm.value ?? null,
    since: Number(alarm.since) || Date.now(),
    gatewayId: meta.gatewayId || null,
    applianceId: meta.applianceId || null,
    locationSlug: meta.locationSlug || null,
    systemSlug: meta.systemSlug || null,
  };

  if (isServiceBusConfigured() && DEPLOYMENT_MODE === 'cloud') {
    const envelope = buildAlarmTransitionEnvelope({ tenantId: tid, ...payload });
    await sendQueueMessage(QUEUES.ALARM_TRANSITIONS, envelope, {
      subject: 'alarm:transition',
      messageId: `${tid}-${payload.tagId}-${payload.since}`,
    });
    return { ok: true, path: 'servicebus', queue: QUEUES.ALARM_TRANSITIONS };
  }

  const recipients = await authService.listNotificationRecipients(tid, payload.level);
  let notifyResult = {
    email: { sent: 0, failed: 0, skipped: 'no_recipients' },
    sms: { sent: 0, failed: 0, skipped: 'no_recipients' },
  };
  if (recipients.length) {
    const { deliverAlarmNotifications } = require('../notifications/alarmDelivery');
    notifyResult = await deliverAlarmNotifications({
      tenantId: tid,
      tenantName: tenant.name,
      alarm: payload,
      recipients,
    });
  }

  if (tenant.cmmsEnabled || tenant.cmms?.enabled) {
    const { getDb } = require('../db/mongo');
    await getDb().collection('cmms_alarm_events').insertOne({
      ...buildCloudCmmsAlarmPayload(tenant, payload),
      gatewayId: payload.gatewayId,
      applianceId: payload.applianceId,
      receivedAt: new Date(),
      status: 'pending',
    });
  }

  return { ok: true, path: 'direct', notify: notifyResult };
}

/**
 * Normalize appliance MQTT/HTTP alarm relay body.
 * @param {object} body
 */
async function ingestApplianceAlarmRelay(body) {
  const parsed = parseApplianceAlarmRelay(body);
  if (!parsed) {
    return { ok: false, error: 'Invalid alarm relay payload', status: 400 };
  }
  return processCloudAlarmIngest(parsed.tenantId, parsed.alarm, {
    ...parsed.meta,
    gatewayId: parsed.gatewayId || parsed.meta.gatewayId,
  });
}

module.exports = {
  processCloudAlarmIngest,
  ingestApplianceAlarmRelay,
};
