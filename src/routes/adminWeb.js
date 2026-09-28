'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { isPlatformAdminConfigured, platformAdminKeyMatches } = require('../config');
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

const router = express.Router();
router.use(attachPlatformAdmin);

function adminLocals(req, extra = {}) {
  return {
    title: extra.title || 'Admin',
    version: APP_VERSION,
    activeNav: extra.activeNav || '',
    error: extra.error || null,
    success: extra.success || null,
    ...extra,
    form: extra.form || {},
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
  if (!isPlatformAdminConfigured()) {
    return res.status(503).render('admin/login', adminLocals(req, {
      title: 'Admin',
      error: 'PLATFORM_ADMIN_KEY is not set on this server. Edit /etc/peaklogic/saas.env, set a real key (openssl rand -hex 24), then: sudo systemctl restart peaklogic-saas',
    }));
  }
  res.render('admin/login', adminLocals(req, {
    title: 'Login',
    message: req.query.message || null,
  }));
});

router.post('/login', (req, res) => {
  if (!isPlatformAdminConfigured()) {
    return res.status(503).render('admin/login', adminLocals(req, {
      error: 'PLATFORM_ADMIN_KEY is not configured in /etc/peaklogic/saas.env.',
    }));
  }
  const key = String(req.body.platformAdminKey || '').trim().replace(/\r/g, '');
  if (!platformAdminKeyMatches(key)) {
    return res.render('admin/login', adminLocals(req, {
      error: 'Invalid platform admin key. Edit /etc/peaklogic/saas.env on this server (not /home/peaklogic/saas.env), set PLATFORM_ADMIN_KEY=your-key with no quotes, then: sudo systemctl restart peaklogic-saas',
    }));
  }
  setPlatformAdminCookie(res, req);
  res.redirect('/admin/tenants');
});

router.get('/logout', (req, res) => {
  clearPlatformAdminCookie(res, req);
  res.redirect('/admin/login?message=Signed%20out');
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
    title: 'New customer',
    activeNav: 'new',
  }));
});

router.post('/tenants', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const cmmsEnabled = b.cmmsEnabled === 'on' || b.cmmsEnabled === 'true';

  const result = await tenantService.createTenantAsPlatform({
    tenantName: b.tenantName,
    tenantSlug: b.tenantSlug,
    email: b.email,
    password: b.password,
    cmmsEnabled,
  });
  if (!result.ok) {
    return res.status(result.status || 400).render('admin/tenant-new', adminLocals(req, {
      title: 'New customer',
      activeNav: 'new',
      error: result.error,
      form: b,
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
    created: req.query.created === '1',
    settingsUpdated: req.query.cmms === 'updated',
  }));
}));

router.post('/tenants/:id/cmms', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const enabled = req.body.enabled === 'on' || req.body.enabled === 'true';
  const externalUrl = req.body.externalUrl || '';
  const result = await tenantService.updateTenantCmms(req.params.id, { enabled, externalUrl });
  if (!result.ok) return res.status(result.status).send(result.error);
  res.redirect(`/admin/tenants/${req.params.id}?cmms=updated`);
}));

module.exports = router;
