'use strict';

const { DEPLOYMENT_MODE } = require('../config');
const { isServiceBusConfigured, sendQueueMessage } = require('./serviceBus');
const { QUEUES } = require('./queues');
const { buildAlarmTransitionEnvelope } = require('./alarmMessages');
const { isAlarmNotifyConfigured } = require('../notifications/alarmDelivery');

function registerCloudAlarmNotifications() {
  const { on } = require('../runtime/eventBus');
  const { getRequestContext } = require('../runtime/requestContext');
  const authService = require('../services/authService');
  const { resolveAlarmContext } = require('../alarms/alarmContext');
  const { deliverAlarmNotifications } = require('../notifications/alarmDelivery');

  on('alarm:transition', (evt) => {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) return;

    Promise.resolve()
      .then(async () => {
        const tenant = await authService.getTenantById(tenantId);
        if (!tenant) return;
        const alarmContext = resolveAlarmContext(evt, { tenantId });
        const recipients = await authService.listNotificationRecipients(tenantId, evt.level, alarmContext);
        if (!recipients.length) return;
        await deliverAlarmNotifications({
          tenantId,
          tenantName: tenant.name,
          alarm: { ...evt, ...alarmContext },
          recipients,
        });
      })
      .catch((err) => {
        console.warn('[notify] alarm:transition:', err?.message || err);
      });
  });

  console.log('[notify] alarm email/SMS enabled (in-process, no Service Bus)');
}

/**
 * Cloud deployment: publish in-process alarm:transition events to Service Bus.
 * When Service Bus is absent but SMTP or Twilio is set, deliver alarms in-process.
 */
function registerCloudServices() {
  if (DEPLOYMENT_MODE !== 'cloud') return { enabled: false };

  const { on } = require('../runtime/eventBus');
  const { getRequestContext } = require('../runtime/requestContext');

  if (isServiceBusConfigured()) {
    on('alarm:transition', (evt) => {
      const ctx = getRequestContext();
      const envelope = buildAlarmTransitionEnvelope({
        tenantId: ctx?.tenantId || null,
        ...evt,
      });
      sendQueueMessage(QUEUES.ALARM_TRANSITIONS, envelope, {
        subject: 'alarm:transition',
        messageId: `${envelope.tenantId || 'local'}-${evt.tagId}-${evt.since}`,
      }).catch((err) => {
        console.warn('[servicebus] publish alarm:transition:', err?.message || err);
      });
    });
    console.log(`[servicebus] publishing alarm:transition → ${QUEUES.ALARM_TRANSITIONS}`);
    return { enabled: true, serviceBus: true };
  }

  if (isAlarmNotifyConfigured()) {
    registerCloudAlarmNotifications();
    return { enabled: true, serviceBus: false, notify: true };
  }

  console.log('[servicebus] not configured — alarm events stay in-process only');
  return { enabled: false };
}

module.exports = { registerCloudServices };
