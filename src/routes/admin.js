'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { requirePlatformAdmin } = require('../auth/middleware');
const tenantService = require('../services/tenantService');

const router = express.Router();
router.use(requirePlatformAdmin);

router.get('/tenants', asyncHandler(async (req, res) => {
  const tenants = await tenantService.listAllTenants();
  res.json({ tenants });
}));

router.post('/tenants', asyncHandler(async (req, res) => {
  const result = await tenantService.createTenantAsPlatform(req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ tenant: result.tenant, user: result.user });
}));

router.get('/tenants/:tenantId', asyncHandler(async (req, res) => {
  const result = await tenantService.getTenantDetail(req.params.tenantId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ tenant: result.tenant, users: result.users, userCount: result.userCount });
}));

router.patch('/tenants/:tenantId/cmms', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.enabled === undefined && body.externalUrl === undefined) {
    return res.status(400).json({ error: 'enabled or externalUrl required' });
  }
  const result = await tenantService.updateTenantCmms(req.params.tenantId, {
    enabled: body.enabled === true || body.enabled === 'true',
    externalUrl: body.externalUrl,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ tenant: result.tenant });
}));

module.exports = router;
