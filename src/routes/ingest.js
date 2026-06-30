'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { pairingKeyValid } = require('../services/appliancePairingService');
const { isServiceBusConfigured, sendQueueMessage } = require('../messaging/serviceBus');
const { isEventHubIngest, isEventHubConfigured, publishTelemetry } = require('../messaging/eventHub');
const { QUEUES } = require('../messaging/queues');
const { buildParcIngestEnvelope } = require('../messaging/ingestMessages');
const { storeSlimTelemetry } = require('../ingest/storeSlimTelemetry');
const { TELEMETRY_INGEST_MODE } = require('../config');
const { authenticate } = require('../auth/middleware');

const router = express.Router();

function ingestKeyFromReq(req) {
  return String(
    req.headers['x-ingest-key']
    || req.headers['x-appliance-key']
    || req.body?.pairingKey
    || '',
  ).trim();
}

function canIngest(req) {
  const key = ingestKeyFromReq(req);
  if (key && pairingKeyValid(key)) return true;
  return Boolean(req.auth?.tenantId);
}

/**
 * Debug/admin HTTP ingest — production devices should publish to Event Hub directly.
 * Event Hub Capture → datalake; Azure Function → slim DocumentDB (7d TTL).
 */
router.post('/parc', asyncHandler(async (req, res) => {
  if (!canIngest(req)) {
    return res.status(401).json({ error: 'Valid X-Ingest-Key or tenant JWT required' });
  }

  const tenantId = String(req.body?.tenantId || req.auth?.tenantId || '').trim();
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  let envelope;
  try {
    envelope = buildParcIngestEnvelope({
      tenantId,
      deviceId: req.body?.deviceId,
      gatewayId: req.body?.gatewayId,
      systemId: req.body?.systemId,
      report: req.body?.report,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (isEventHubIngest() || (TELEMETRY_INGEST_MODE === 'eventhub' && isEventHubConfigured())) {
    await publishTelemetry(envelope);
    return res.status(202).json({
      ok: true,
      path: 'eventhub',
      eventHub: process.env.EVENT_HUB_NAME || 'telemetry',
      note: 'Capture archives to datalake; Function writes slim 7d DocumentDB',
    });
  }

  if (TELEMETRY_INGEST_MODE === 'servicebus' && isServiceBusConfigured()) {
    await sendQueueMessage(QUEUES.PARC_INGEST, envelope, {
      subject: 'parc:telemetry',
      messageId: `${tenantId}-${envelope.deviceId}-${Date.now()}`,
    });
    return res.status(202).json({ ok: true, path: 'servicebus', queue: QUEUES.PARC_INGEST });
  }

  const stored = await storeSlimTelemetry(envelope);
  return res.status(201).json({ ok: true, path: 'direct', stored });
}));

router.use(authenticate);

router.get('/telemetry/:deviceId', asyncHandler(async (req, res) => {
  const { getDb } = require('../db/mongo');
  const deviceId = String(req.params.deviceId || '').trim();
  const doc = await getDb().collection('device_telemetry_latest').findOne({
    tenantId: req.auth.tenantId,
    deviceId,
  });
  if (!doc) return res.status(404).json({ error: 'No telemetry for device' });
  res.json({ telemetry: doc });
}));

module.exports = router;
