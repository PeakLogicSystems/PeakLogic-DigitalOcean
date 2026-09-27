'use strict';

const {
  SERVICE_BUS_CONNECTION_STRING,
  SERVICE_BUS_NAMESPACE,
} = require('../config');

let client = null;

function isServiceBusConfigured() {
  return Boolean(SERVICE_BUS_CONNECTION_STRING || SERVICE_BUS_NAMESPACE);
}

// @azure/service-bus and @azure/identity are optional peer packages — this
// product's default deployment target is DigitalOcean/MongoDB, not Azure, so
// they aren't installed. Lazy-require them only if someone actually
// configures Service Bus, matching the pattern in messaging/eventHub.js.
function getServiceBusClient() {
  if (client) return client;
  if (SERVICE_BUS_CONNECTION_STRING) {
    const { ServiceBusClient } = require('@azure/service-bus');
    client = new ServiceBusClient(SERVICE_BUS_CONNECTION_STRING);
    return client;
  }
  if (SERVICE_BUS_NAMESPACE) {
    const { ServiceBusClient } = require('@azure/service-bus');
    const { DefaultAzureCredential } = require('@azure/identity');
    const fqns = `${SERVICE_BUS_NAMESPACE}.servicebus.windows.net`;
    client = new ServiceBusClient(fqns, new DefaultAzureCredential());
    return client;
  }
  throw new Error('Service Bus not configured — set SERVICE_BUS_CONNECTION_STRING or SERVICE_BUS_NAMESPACE');
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
