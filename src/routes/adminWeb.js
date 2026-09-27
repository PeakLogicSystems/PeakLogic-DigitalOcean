'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { PLATFORM_ADMIN_KEY } = require('../config');
const {
  attachPlatformAdmin,
  requirePlatformAdminWeb,
} = require('../auth/middleware');
const {
  setPlatformAdminCookie,
  clearPlatformAdminCookie,
  isValidPlatformAdminSession,
  getPlatformAdminCookie,
} = require('../auth/platformAdminSession');
const tenantService = require('../services/tenantService');
const { CMMS_PLANS } = require('../tenants/cmmsEntitlement');
const { TENANT_PLANS } = require('../tenants/tenantPlan');

const router = express.Router();
router.use(attachPlatformAdmin);

function adminLocals(req, extra = {}) {
  return {
    title: extra.title || 'Platform Admin',
    version: APP_VERSION,
    activeNav: extra.activeNav || '',
    error: extra.error || null,
    success: extra.success || null,
    ...extra,
  };
}

router.get('/', (req, res) => {
  if (req.platformAdmin || isValidPlatformAdminSession(getPlatformAdminCookie(req))) {
    return res.redirect('/admin/tenants');
  }
  return res.redirect('/admin/login');
});

router.get('/login', (req, res) => {
  if (req.platformAdmin) return res.redirect('/admin/tenants');
  if (!PLATFORM_ADMIN_KEY) {
    return res.status(503).render('admin/login', adminLocals(req, {
      title: 'Platform Admin',
      error: 'PLATFORM_ADMIN_KEY is not configured on this server.',
    }));
  }
  res.render('admin/login', adminLocals(req, { title: 'Platform Admin Login' }));
});

router.post('/login', (req, res) => {
  if (!PLATFORM_ADMIN_KEY) {
    return res.status(503).render('admin/login', adminLocals(req, {
      error: 'PLATFORM_ADMIN_KEY is not configured.',
    }));
  }
  const key = String(req.body.platformAdminKey || '').trim();
  if (key !== PLATFORM_ADMIN_KEY) {
    return res.render('admin/login', adminLocals(req, {
      error: 'Invalid platform admin key.',
    }));
  }
  setPlatformAdminCookie(res, req);
  res.redirect('/admin/tenants');
});

router.get('/logout', (req, res) => {
  clearPlatformAdminCookie(res, req);
  res.redirect('/admin/login');
});

router.get('/tenants', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const tenants = await tenantService.listAllTenants();
  res.render('admin/tenants', adminLocals(req, {
    title: 'Tenants',
    activeNav: 'tenants',
    tenants,
  }));
}));

router.get('/tenants/new', requirePlatformAdminWeb, (req, res) => {
  res.render('admin/tenant-new', adminLocals(req, {
    title: 'Create tenant',
    activeNav: 'new',
    cmmsPlans: CMMS_PLANS.filter((p) => p !== 'none'),
  }));
});

router.post('/tenants', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const cmmsEnabled = req.body.cmmsEnabled === 'on' || req.body.cmmsEnabled === 'true';
  const result = await tenantService.createTenantAsPlatform({
    tenantName: req.body.tenantName,
    tenantSlug: req.body.tenantSlug,
    email: req.body.email,
    password: req.body.password,
    cmms: cmmsEnabled
      ? { enabled: true, plan: req.body.cmmsPlan || 'standard' }
      : undefined,
  });
  if (!result.ok) {
    return res.status(result.status).render('admin/tenant-new', adminLocals(req, {
      title: 'Create tenant',
      activeNav: 'new',
      cmmsPlans: CMMS_PLANS.filter((p) => p !== 'none'),
      error: result.error,
      form: req.body,
    }));
  }
  res.redirect(`/admin/tenants/${result.tenant.id}?created=1`);
}));

router.get('/tenants/:id', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const result = await tenantService.getTenantDetail(req.params.id);
  if (!result.ok) return res.status(404).send('Tenant not found');
  res.render('admin/tenant-detail', adminLocals(req, {
    title: result.tenant.name,
    activeNav: 'tenants',
    tenant: result.tenant,
    users: result.users,
    userCount: result.userCount,
    cmmsPlans: CMMS_PLANS.filter((p) => p !== 'none'),
    tenantPlans: TENANT_PLANS,
    created: req.query.created === '1',
    settingsUpdated: req.query.settings === 'updated' || req.query.cmms === 'updated',
  }));
}));

router.post('/tenants/:id/cmms', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const enabled = req.body.enabled === 'on' || req.body.enabled === 'true';
  const cmmsPlan = req.body.cmmsPlan || req.body.plan || 'standard';
  const peaklogicPlan = req.body.peaklogicPlan || req.body.tenantPlan || 'standard';
  const result = await tenantService.updateTenantSettings(
    req.params.id,
    {
      plan: peaklogicPlan,
      cmms: { enabled, plan: cmmsPlan },
    },
    { enabledBy: 'platform-admin' },
  );
  if (!result.ok) return res.status(result.status).send(result.error);
  res.redirect(`/admin/tenants/${req.params.id}?settings=updated`);
}));

module.exports = router;
