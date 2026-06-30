'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireCmmsEntitlement } = require('../auth/middleware');
const cmmsStore = require('../cmms/cmmsStore');

const router = express.Router();
router.use(authenticate, requireCmmsEntitlement);

router.get('/status', asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    cmms: req.tenantCmms,
    message: 'CMMS module enabled for this tenant',
  });
}));

router.get('/work-orders', asyncHandler(async (req, res) => {
  const workOrders = await cmmsStore.listWorkOrders(req.auth.tenantId);
  res.json({ workOrders });
}));

module.exports = router;
