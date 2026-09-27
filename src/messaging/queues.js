'use strict';

/** Azure Service Bus queue names (override via env for multi-env deploys). */
const QUEUES = {
  ALARM_TRANSITIONS: process.env.SERVICE_BUS_QUEUE_ALARM_TRANSITIONS || 'alarm-transitions',
  ALARM_NOTIFY: process.env.SERVICE_BUS_QUEUE_ALARM_NOTIFY || 'alarm-notify',
  CMMS_ALARMS: process.env.SERVICE_BUS_QUEUE_CMMS_ALARMS || 'cmms-alarms',
  PARC_INGEST: process.env.SERVICE_BUS_QUEUE_PARC_INGEST || 'parc-ingest',
};

module.exports = { QUEUES };
