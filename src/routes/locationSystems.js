'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const systemService = require('../services/systemService');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const result = await systemService.listSystems(req.auth.tenantId, req.params.locationId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ systems: result.systems });
}));

router.post('/', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await systemService.createSystem(req.auth.tenantId, req.params.locationId, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ system: result.system });
}));

module.exports = router;
