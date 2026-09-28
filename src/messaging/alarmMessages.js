'use strict';

const { SCHEMA } = require('../settings/cmmsIntegrationSettings');

/**
 * Envelope published to alarm-transitions queue.
 * @param {{ tenantId?: string|null, tagId: string, level: string, previousLevel?: *, value?: *, since: number }} alarm
 */
function buildAlarmTransitionEnvelope(alarm) {
  const { tenantId, tagId, level, previousLevel, value, since } = alarm;
  return {
    type: 'alarm:transition',
    publishedAt: new Date().toISOString(),
    tenantId: tenantId || null,
    payload: {
      tagId,
      level,
      previousLevel: previousLevel ?? null,
      value: value ?? null,
      since,
    },
  };
}

/**
 * Job for alarm-notify queue — one batch per alarm with all recipients.
 * @param {string} tenantId
 * @param {object} alarm — payload fields
 * @param {object[]} recipients — publicUser rows
 */
function buildAlarmNotifyJob(tenantId, alarm, recipients) {
  return {
    type: 'alarm:notify',
    publishedAt: new Date().toISOString(),
    tenantId,
    alarm: {
      tagId: alarm.tagId,
      level: alarm.level,
      previousLevel: alarm.previousLevel ?? null,
      value: alarm.value ?? null,
      since: alarm.since,
    },
    recipients,
  };
}

/**
 * CMMS integration v1 payload for cloud tenants.
 * @param {{ id?: string, _id?: *, slug: string, name?: string }} tenant
 * @param {object} alarm — payload fields
 */
function buildCloudCmmsAlarmPayload(tenant, alarm) {
  const tenantId = tenant.id || (tenant._id && String(tenant._id)) || '';
  return {
    schema: SCHEMA,
    publishedAt: new Date().toISOString(),
    siteId: tenant.slug,
    tenantId,
    source: 'peaklogic-cloud',
    projectName: tenant.name || tenant.slug,
    alarm: {
      tagId: alarm.tagId,
      level: alarm.level,
      previousLevel: alarm.previousLevel ?? null,
      value: alarm.value ?? null,
      since: alarm.since,
    },
  };
}

module.exports = {
  buildAlarmTransitionEnvelope,
  buildAlarmNotifyJob,
  buildCloudCmmsAlarmPayload,
};
