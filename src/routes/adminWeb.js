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
const fleetOnboardingService = require('../services/fleetOnboardingService');
const { listStationTypes } = require('../fleet/stationTypes');
const { listFloridaCounties } = require('../fleet/floridaCounties');
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
      title: 'Platform Admin',
      error: 'PLATFORM_ADMIN_KEY is not set on this server. Edit /etc/peaklogic/saas.env, set a real key (openssl rand -hex 24), then: sudo systemctl restart peaklogic-saas',
    }));
  }
  res.render('admin/login', adminLocals(req, {
    title: 'Platform Admin Login',
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
    deleted: req.query.deleted === '1',
  }));
}));

function newTenantLocals(req, extra = {}) {
  return adminLocals(req, {
    title: 'New customer',
    activeNav: 'new',
    cmmsPlans: CMMS_PLANS.filter((p) => p !== 'none'),
    stationTypes: listStationTypes(),
    counties: listFloridaCounties(),
    ...extra,
  });
}

router.get('/tenants/new', requirePlatformAdminWeb, (req, res) => {
  res.render('admin/tenant-new', newTenantLocals(req));
});

router.post('/tenants', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const cmmsEnabled = b.cmmsEnabled === 'on' || b.cmmsEnabled === 'true';
  const wantsStation = (b.addStation === 'on' || b.addStation === 'true') && String(b.stationType || '').trim();

  let result;
  try {
    result = await fleetOnboardingService.onboardCustomer({
      tenantName: b.tenantName,
      tenantSlug: b.tenantSlug,
      email: b.email,
      password: b.password,
      cmms: cmmsEnabled ? { enabled: true, plan: b.cmmsPlan || 'standard' } : undefined,
      station: wantsStation
        ? {
          stationType: b.stationType,
          stationName: b.stationName,
          stationSlug: b.stationSlug,
          county: b.county,
          address: b.address,
          lat: b.lat,
          lng: b.lng,
          deviceId: b.deviceId,
          deviceSlug: b.deviceSlug,
          scanMs: b.scanMs,
        }
        : null,
    });
  } catch (err) {
    console.error('[admin] onboard customer failed:', err.stack || err.message);
    return res.status(500).render('admin/tenant-new', newTenantLocals(req, {
      error: err.message || 'Could not create customer. Check server logs (journalctl -u peaklogic-saas).',
      form: b,
    }));
  }
  if (!result.ok) {
    return res.status(result.status || 400).render('admin/tenant-new', newTenantLocals(req, {
      error: result.error,
      form: b,
    }));
  }
  const params = new URLSearchParams({ created: '1' });
  if (result.stationError) params.set('error', `Customer created. Station skipped: ${result.stationError}`);
  else if (result.station) params.set('station', '1');
  res.redirect(`/admin/tenants/${result.tenant.id}?${params.toString()}`);
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
    stationProvisioned: req.query.station === '1',
    settingsUpdated: req.query.settings === 'updated' || req.query.cmms === 'updated',
    profileUpdated: req.query.profile === 'updated',
    error: req.query.error || null,
  }));
}));

router.post('/tenants/:id/profile', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  let result;
  try {
    result = await tenantService.updateTenantProfile(req.params.id, {
      tenantName: req.body.tenantName,
      tenantSlug: req.body.tenantSlug,
    });
  } catch (err) {
    console.error('[admin] update tenant profile failed:', err.stack || err.message);
    const params = new URLSearchParams({
      error: err.message || 'Could not update tenant. Redeploy latest code and try again.',
    });
    return res.redirect(`/admin/tenants/${req.params.id}?${params.toString()}`);
  }
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Update failed' });
    return res.redirect(`/admin/tenants/${req.params.id}?${params.toString()}`);
  }
  res.redirect(`/admin/tenants/${req.params.id}?profile=updated`);
}));

router.post('/tenants/:id/delete', requirePlatformAdminWeb, asyncHandler(async (req, res) => {
  let result;
  try {
    result = await tenantService.deleteTenant(req.params.id, {
      confirmSlug: req.body.confirmSlug,
    });
  } catch (err) {
    console.error('[admin] delete tenant failed:', err.stack || err.message);
    const params = new URLSearchParams({
      error: err.message || 'Could not delete tenant. Redeploy latest code and try again.',
    });
    return res.redirect(`/admin/tenants/${req.params.id}?${params.toString()}`);
  }
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Delete failed' });
    return res.redirect(`/admin/tenants/${req.params.id}?${params.toString()}`);
  }
  res.redirect('/admin/tenants?deleted=1');
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
