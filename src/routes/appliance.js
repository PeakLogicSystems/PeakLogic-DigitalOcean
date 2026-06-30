'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const appliancePairingService = require('../services/appliancePairingService');
const { status: cloudRelayStatus } = require('../integrations/applianceCloudRelay');

const router = express.Router();

/** Pair est-pc / Linux appliance as remote gateway for a tenant site. */
router.post('/pair', asyncHandler(async (req, res) => {
  const result = await appliancePairingService.pairAppliance(req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result);
}));

/** Appliance cloud-remote status (runtime fork / dev). */
router.get('/remote/status', (req, res) => {
  try {
    res.json({ cloudRemote: cloudRelayStatus() });
  } catch (err) {
    res.json({ cloudRemote: { enabled: false, error: err.message } });
  }
});

module.exports = router;
