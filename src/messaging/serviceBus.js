'use strict';

const {
  SERVICE_BUS_CONNECTION_STRING,
  SERVICE_BUS_NAMESPACE,
} = require('../config');

// @azure/service-bus and @azure/identity are OPTIONAL deps: only needed when
// Azure Service Bus is actually configured. Requiring them at module load would
// crash the whole app on boot wherever they aren't installed (e.g. cloud/SaaS
// droplets that use local Mongo and no Azure), even though this file is pulled
// in unconditionally via ingest.js -> cloudApp.js. Load them lazily instead.
let client = null;

function isServiceBusConfigured() {
  return Boolean(SERVICE_BUS_CONNECTION_STRING || SERVICE_BUS_NAMESPACE);
}

function getServiceBusClient() {
  if (client) return client;
  if (!isServiceBusConfigured()) {
    throw new Error('Service Bus not configured — set SERVICE_BUS_CONNECTION_STRING or SERVICE_BUS_NAMESPACE');
  }

  let ServiceBusClient;
  try {
    ({ ServiceBusClient } = require('@azure/service-bus'));
  } catch (err) {
    throw new Error('Service Bus is configured but @azure/service-bus is not installed — run: npm install @azure/service-bus @azure/identity');
  }

  if (SERVICE_BUS_CONNECTION_STRING) {
    client = new ServiceBusClient(SERVICE_BUS_CONNECTION_STRING);
    return client;
  }
  const { DefaultAzureCredential } = require('@azure/identity');
  const fqns = `${SERVICE_BUS_NAMESPACE}.servicebus.windows.net`;
  client = new ServiceBusClient(fqns, new DefaultAzureCredential());
  return client;
}

/**
 * @param {string} queueName
 * @param {object} body — JSON-serializable
 * @param {object} [opts]
 * @param {string} [opts.messageId]
 * @param {string} [opts.subject]
 */
async function sendQueueMessage(queueName, body, opts = {}) {
  const sb = getServiceBusClient();
  const sender = sb.createSender(queueName);
  try {
    await sender.sendMessages({
      body,
      messageId: opts.messageId,
      subject: opts.subject || body.type,
      contentType: 'application/json',
    });
  } finally {
    await sender.close();
  }
}

async function closeServiceBus() {
  if (client) {
    await client.close();
    client = null;
  }
}

module.exports = {
  isServiceBusConfigured,
  getServiceBusClient,
  sendQueueMessage,
  closeServiceBus,
};
