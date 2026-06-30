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
  const patch = {};
  if (body.cmms != null) {
    patch.cmms = body.cmms;
    if (body.plan != null) patch.plan = body.plan;
  } else if (body.enabled !== undefined) {
    patch.cmms = {
      enabled: body.enabled === true || body.enabled === 'true',
      plan: body.plan || 'standard',
    };
  } else if (body.plan != null) {
    patch.plan = body.plan;
  }
  if (!patch.plan && !patch.cmms) {
    return res.status(400).json({ error: 'plan or cmms required' });
  }
  const result = await tenantService.updateTenantSettings(
    req.params.tenantId,
    patch,
    { enabledBy: 'platform-admin' },
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ tenant: result.tenant });
}));

module.exports = router;
