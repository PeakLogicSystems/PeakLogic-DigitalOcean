'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const systemService = require('../services/systemService');
const deviceService = require('../services/deviceService');

const router = express.Router();
router.use(authenticate);

router.get('/:id', asyncHandler(async (req, res) => {
  const system = await systemService.getSystem(req.auth.tenantId, req.params.id);
  if (!system) return res.status(404).json({ error: 'System not found' });
  res.json({ system });
}));

router.patch('/:id', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await systemService.updateSystem(req.auth.tenantId, req.params.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ system: result.system });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await systemService.deleteSystem(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(204).end();
}));

router.get('/:systemId/devices', asyncHandler(async (req, res) => {
  const result = await deviceService.listDevices(req.auth.tenantId, req.params.systemId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ devices: result.devices });
}));

router.post('/:systemId/devices', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await deviceService.createDevice(req.auth.tenantId, req.params.systemId, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ device: result.device });
}));

module.exports = router;
