'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const locationService = require('../services/locationService');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const locations = await locationService.listLocations(req.auth.tenantId);
  res.json({ locations });
}));

router.post('/', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await locationService.createLocation(req.auth.tenantId, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ location: result.location });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const location = await locationService.getLocation(req.auth.tenantId, req.params.id);
  if (!location) return res.status(404).json({ error: 'Location not found' });
  res.json({ location });
}));

router.patch('/:id', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = await locationService.updateLocation(req.auth.tenantId, req.params.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ location: result.location });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await locationService.deleteLocation(req.auth.tenantId, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(204).end();
}));

module.exports = router;
