'use strict';

const { EVENT_HUB_CONNECTION_STRING, EVENT_HUB_NAME, TELEMETRY_INGEST_MODE } = require('../config');

let producer = null;
let producerConnecting = null;

function isEventHubIngest() {
  return TELEMETRY_INGEST_MODE === 'eventhub' && Boolean(EVENT_HUB_CONNECTION_STRING);
}

function isEventHubConfigured() {
  return Boolean(EVENT_HUB_CONNECTION_STRING && EVENT_HUB_NAME);
}

async function getProducer() {
  if (producer) return producer;
  if (!isEventHubConfigured()) {
    throw new Error('Event Hub not configured — set EVENT_HUB_CONNECTION_STRING and EVENT_HUB_NAME');
  }
  if (producerConnecting) return producerConnecting;

  producerConnecting = (async () => {
    const { EventHubProducerClient } = require('@azure/event-hubs');
    producer = new EventHubProducerClient(
      EVENT_HUB_CONNECTION_STRING,
      EVENT_HUB_NAME,
    );
    return producer;
  })();

  try {
    return await producerConnecting;
  } catch (err) {
    producerConnecting = null;
    throw err;
  }
}

/**
 * Publish ingest envelope to Event Hub (Capture → datalake).
 * @param {object} envelope
 */
async function publishTelemetry(envelope) {
  const client = await getProducer();
  const batch = await client.createBatch();
  const added = batch.tryAdd({
    body: envelope,
    contentType: 'application/json',
    messageId: `${envelope.tenantId}-${envelope.deviceId}-${Date.now()}`,
  });
  if (!added) {
    throw new Error('Event Hub batch full — reduce payload size or batch at edge');
  }
  await client.sendBatch(batch);
}

async function closeEventHub() {
  if (producer) {
    await producer.close();
    producer = null;
  }
  producerConnecting = null;
}

module.exports = {
  isEventHubIngest,
  isEventHubConfigured,
  publishTelemetry,
  closeEventHub,
};
