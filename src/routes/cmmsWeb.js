'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const authService = require('../services/authService');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const { requireCmmsWeb, cmmsContext } = require('../cmms/cmmsMiddleware');
const cmmsStore = require('../cmms/cmmsStore');

const router = express.Router();
router.use(attachAuth, requireWebAuth, cmmsContext);

router.get('/', (req, res) => res.redirect('/cmms/dashboard'));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const stats = await cmmsStore.dashboardStats(req.auth.tenantId);
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, { activeNav: 'cmms', title: 'CMMS Dashboard', version: APP_VERSION });
  res.render('cmms/dashboard', { stats, cmmsUser: req.cmmsUser });
}));

router.get('/work-orders', requireCmmsWeb('viewer'), asyncHandler(async (req, res) => {
  const workOrders = await cmmsStore.listWorkOrders(req.auth.tenantId);
  const facilities = await cmmsStore.listFacilities(req.auth.tenantId);
  const facMap = Object.fromEntries(facilities.map((f) => [f._id, f.name]));
  applyShellLocals(res, await loadShellContext(req), { activeNav: 'cmms', title: 'Work Orders', version: APP_VERSION });
  res.render('cmms/work-orders', {
    workOrders,
    facMap,
    cmmsUser: req.cmmsUser,
    message: req.query.created ? 'Work order created.' : null,
  });
}));

router.get('/work-orders/new', requireCmmsWeb('technician'), asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const [facilities, assets] = await Promise.all([
    cmmsStore.listFacilities(tenantId),
    cmmsStore.listAssets(tenantId),
  ]);
  applyShellLocals(res, await loadShellContext(req), { activeNav: 'cmms', title: 'New Work Order', version: APP_VERSION });
  res.render('cmms/work-order-new', { facilities, assets, error: null });
}));

router.post('/work-orders', requireCmmsWeb('technician'), asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.auth.tenantId, req.auth.userId);
  const result = await cmmsStore.createWorkOrder(req.auth.tenantId, req.body, user);
  if (!result.ok) {
    const [facilities, assets] = await Promise.all([
      cmmsStore.listFacilities(req.auth.tenantId),
      cmmsStore.listAssets(req.auth.tenantId),
    ]);
    applyShellLocals(res, await loadShellContext(req), { activeNav: 'cmms', title: 'New Work Order', version: APP_VERSION });
    return res.status(400).render('cmms/work-order-new', { facilities, assets, error: result.error });
  }
  res.redirect('/cmms/work-orders?created=1');
}));

router.get('/assets', requireCmmsWeb('viewer'), asyncHandler(async (req, res) => {
  const assets = await cmmsStore.listAssets(req.auth.tenantId);
  const facilities = await cmmsStore.listFacilities(req.auth.tenantId);
  applyShellLocals(res, await loadShellContext(req), {
    activeNav: 'cmms', title: 'Assets', version: APP_VERSION,
  });
  res.render('cmms/assets', { assets, facilities, error: null, message: req.query.created ? 'Asset created.' : null });
}));

router.post('/assets', requireCmmsWeb('technician'), asyncHandler(async (req, res) => {
  const result = await cmmsStore.createAsset(req.auth.tenantId, req.body);
  if (!result.ok) {
    const facilities = await cmmsStore.listFacilities(req.auth.tenantId);
    applyShellLocals(res, await loadShellContext(req), {
      activeNav: 'cmms', title: 'Assets', version: APP_VERSION,
    });
    return res.status(400).render('cmms/assets', {
      assets: await cmmsStore.listAssets(req.auth.tenantId),
      facilities,
      error: result.error,
      message: null,
    });
  }
  res.redirect('/cmms/assets?created=1');
}));

router.get('/facilities', requireCmmsWeb('viewer'), asyncHandler(async (req, res) => {
  const facilities = await cmmsStore.listFacilities(req.auth.tenantId);
  applyShellLocals(res, await loadShellContext(req), {
    activeNav: 'cmms', title: 'Facilities', version: APP_VERSION,
  });
  res.render('cmms/facilities', { facilities, error: null, message: req.query.created ? 'Facility created.' : null });
}));

router.post('/facilities', requireCmmsWeb('technician'), asyncHandler(async (req, res) => {
  const result = await cmmsStore.createFacility(req.auth.tenantId, req.body);
  if (!result.ok) {
    applyShellLocals(res, await loadShellContext(req), {
      activeNav: 'cmms', title: 'Facilities', version: APP_VERSION,
    });
    return res.status(400).render('cmms/facilities', {
      facilities: await cmmsStore.listFacilities(req.auth.tenantId),
      error: result.error,
      message: null,
    });
  }
  res.redirect('/cmms/facilities?created=1');
}));

router.get('/users', requireCmmsWeb('admin'), asyncHandler(async (req, res) => {
  const users = await authService.listTenantUsers(req.auth.tenantId);
  applyShellLocals(res, await loadShellContext(req), {
    activeNav: 'cmms', title: 'Users', version: APP_VERSION,
  });
  res.render('cmms/users', { cmmsUsers: users });
}));

module.exports = router;
