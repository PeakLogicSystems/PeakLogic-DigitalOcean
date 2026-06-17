'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const deviceService = require('../services/deviceService');

const router = express.Router();
router.use(authenticate);

router.get('/:id', asyncHandler(async (req, res) => {
  const device = await deviceService.getDevice(req.auth.tenantId, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json({ device });
}));

router.patch('/:id', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await deviceService.updateDevice(req.auth.tenantId, req.params.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ device: result.device });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await deviceService.deleteDevice(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(204).end();
}));

module.exports = router;
