'use strict';

const { getServiceBusClient, isServiceBusConfigured, closeServiceBus, sendQueueMessage } = require('./serviceBus');
const { QUEUES } = require('./queues');
const {
  buildAlarmNotifyJob,
  buildCloudCmmsAlarmPayload,
} = require('./alarmMessages');
const authService = require('../services/authService');
const { resolveAlarmContext } = require('../alarms/alarmContext');
const { getDb } = require('../db/mongo');
const { isParcIngestMessage } = require('./ingestMessages');
const { storeSlimTelemetry } = require('../ingest/storeSlimTelemetry');
const { TELEMETRY_INGEST_MODE } = require('../config');
const {
  effectiveNotificationEmail,
  effectiveNotificationPhone,
} = require('../users/userProfileSchema');

/** @type {import('@azure/service-bus').ServiceBusReceiver[]} */
const receivers = [];

async function handleAlarmTransition(message) {
  const body = message.body;
  if (!body || body.type !== 'alarm:transition') return;

  const { tenantId, payload: alarm } = body;
  if (!tenantId || !alarm) {
    console.log('[servicebus] alarm:transition skipped — no tenantId (local/runtime event)');
    return;
  }

  const tenant = await authService.getTenantById(tenantId);
  if (!tenant) {
    console.warn(`[servicebus] unknown tenant ${tenantId}`);
    return;
  }

  const alarmContext = resolveAlarmContext(alarm, { tenantId });
  const recipients = await authService.listNotificationRecipients(tenantId, alarm.level, alarmContext);
  if (recipients.length) {
    await sendQueueMessage(
      QUEUES.ALARM_NOTIFY,
      buildAlarmNotifyJob(tenantId, { ...alarm, ...alarmContext }, recipients),
      { subject: 'alarm:notify' },
    );
  }

  if (tenant.cmmsEnabled || tenant.cmms?.enabled) {
    await sendQueueMessage(
      QUEUES.CMMS_ALARMS,
      buildCloudCmmsAlarmPayload(tenant, alarm),
      { subject: 'cmms:alarm' },
    );
  }
}

async function handleAlarmNotify(message) {
  const body = message.body;
  if (!body || body.type !== 'alarm:notify') return;

  const { tenantId, alarm, recipients } = body;
  const tenant = await authService.getTenantById(tenantId);
  const { deliverAlarmNotifications } = require('../notifications/alarmDelivery');
  const result = await deliverAlarmNotifications({
    tenantId,
    tenantName: tenant?.name || tenantId,
    alarm,
    recipients: recipients || [],
  });

  const db = getDb();
  const at = new Date().toISOString();
  const docs = [];
  const anySent = (result.email?.sent || 0) + (result.sms?.sent || 0) > 0;

  for (const user of recipients || []) {
    const n = user.profile?.alarmNotifications || {};
    const channels = [];
    if (n.email) {
      const addr = effectiveNotificationEmail(user);
      if (addr) channels.push({ type: 'email', address: addr });
    }
    if (n.sms) {
      const phone = effectiveNotificationPhone(user);
      if (phone) channels.push({ type: 'sms', address: phone });
    }
    if (n.push) channels.push({ type: 'push', address: user.id });
    if (!channels.length) continue;

    docs.push({
      at,
      tenantId,
      userId: user.id,
      email: user.email,
      tagId: alarm.tagId,
      level: alarm.level,
      value: alarm.value ?? null,
      channels,
      status: anySent ? 'sent' : 'queued',
    });
  }

  if (docs.length) {
    await db.collection('alarm_notify_queue').insertMany(docs);
    console.log(
      `[servicebus] alarm-notify email=${result.email?.sent || 0} sms=${result.sms?.sent || 0} tenant ${tenantId} tag ${alarm.tagId}`,
    );
  }
}

async function handleCmmsAlarm(message) {
  const body = message.body;
  if (!body || body.schema !== 'peaklogic-cmms-integration-v1') return;

  const db = getDb();
  await db.collection('cmms_alarm_events').insertOne({
    ...body,
    receivedAt: new Date(),
    status: 'pending',
  });
  console.log(`[servicebus] cmms alarm stored tenant=${body.tenantId} tag=${body.alarm?.tagId}`);
}

async function handleParcIngest(message) {
  const body = message.body;
  if (!isParcIngestMessage(body)) {
    console.warn('[servicebus] parc-ingest skipped — invalid message shape');
    return;
  }

  const tenant = await authService.getTenantById(body.tenantId);
  if (!tenant) {
    console.warn(`[servicebus] parc-ingest unknown tenant ${body.tenantId}`);
    return;
  }

  const result = await storeSlimTelemetry(body);
  console.log(`[servicebus] parc-ingest slim stored tenant=${result.tenantId} device=${result.deviceId} tags=${result.tagCount}`);
}

function subscribeQueue(queueName, handler) {
  const sb = getServiceBusClient();
  const receiver = sb.createReceiver(queueName, { receiveMode: 'peekLock' });
  receiver.subscribe({
    processMessage: async (message) => {
      try {
        await handler(message);
        await receiver.completeMessage(message);
      } catch (err) {
        console.error(`[servicebus] ${queueName} handler:`, err?.message || err);
        await receiver.abandonMessage(message);
      }
    },
    processError: async (args) => {
      console.error(`[servicebus] ${queueName} receive error:`, args.error?.message || args.error);
    },
  }, { maxConcurrentCalls: 4, autoCompleteMessages: false });
  receivers.push(receiver);
  console.log(`[servicebus] listening on ${queueName}`);
}

async function startServiceBusWorkers() {
  if (!isServiceBusConfigured()) return { started: false };

  subscribeQueue(QUEUES.ALARM_TRANSITIONS, handleAlarmTransition);
  subscribeQueue(QUEUES.ALARM_NOTIFY, handleAlarmNotify);
  subscribeQueue(QUEUES.CMMS_ALARMS, handleCmmsAlarm);

  if (TELEMETRY_INGEST_MODE !== 'eventhub') {
    subscribeQueue(QUEUES.PARC_INGEST, handleParcIngest);
  } else {
    console.log('[servicebus] parc-ingest skipped — TELEMETRY_INGEST_MODE=eventhub (Function handles DB fan-out)');
  }

  return { started: true };
}

async function stopServiceBusWorkers() {
  for (const receiver of receivers) {
    await receiver.close();
  }
  receivers.length = 0;
  await closeServiceBus();
}

module.exports = {
  startServiceBusWorkers,
  stopServiceBusWorkers,
  handleAlarmTransition,
  handleAlarmNotify,
  handleCmmsAlarm,
  handleParcIngest,
};
