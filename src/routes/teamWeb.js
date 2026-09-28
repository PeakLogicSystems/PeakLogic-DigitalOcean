'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const authService = require('../services/authService');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const { listFloridaCounties, countiesByRegion } = require('../fleet/floridaCounties');

const router = express.Router();
router.use(attachAuth, requireWebAuth);

function requireTenantAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  return next();
}

function parseCountyCheckboxes(body) {
  const raw = body.counties;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

router.get('/users', requireTenantAdmin, asyncHandler(async (req, res) => {
  const users = await authService.listTenantUsers(req.auth.tenantId);
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, {
    activeNav: 'team',
    title: 'Team',
    version: APP_VERSION,
  });
  res.render('team/users', {
    teamUsers: users,
    floridaCounties: listFloridaCounties(),
    floridaCountyCount: listFloridaCounties().length,
    message: req.query.invited ? 'Invite sent.' : req.query.resent ? 'Invite resent.' : req.query.saved ? 'County coverage saved.' : null,
    error: req.query.error || null,
  });
}));

router.get('/users/:id/coverage', requireTenantAdmin, asyncHandler(async (req, res) => {
  const target = await authService.getUserById(req.auth.tenantId, req.params.id);
  if (!target) return res.status(404).send('User not found');
  const ctx = await loadShellContext(req);
  applyShellLocals(res, ctx, {
    activeNav: 'team',
    title: 'County coverage',
    version: APP_VERSION,
  });
  const assigned = new Set(target.profile?.fleetScopes?.counties || []);
  res.render('team/user-coverage', {
    targetUser: target,
    regions: countiesByRegion(),
    assigned,
    message: req.query.saved ? 'Coverage saved.' : null,
    error: req.query.error || null,
  });
}));

router.post('/users/:id/coverage', requireTenantAdmin, asyncHandler(async (req, res) => {
  const target = await authService.getUserById(req.auth.tenantId, req.params.id);
  if (!target) return res.status(404).send('User not found');
  const counties = parseCountyCheckboxes(req.body);
  const result = await authService.updateUserProfile(req.auth.tenantId, req.params.id, {
    profile: {
      fleetScopes: { counties },
    },
  }, { admin: true });
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Save failed' });
    return res.redirect(`/team/users/${req.params.id}/coverage?${params.toString()}`);
  }
  res.redirect(`/team/users/${req.params.id}/coverage?saved=1`);
}));

router.post('/users/invite', requireTenantAdmin, asyncHandler(async (req, res) => {
  const counties = parseCountyCheckboxes(req.body);
  const fleetScopes = counties.length ? { counties } : undefined;
  const result = await authService.inviteTenantUser(req.auth.tenantId, {
    email: req.body.email,
    role: req.body.role,
    profile: {
      displayName: req.body.displayName || '',
      ...(fleetScopes ? { fleetScopes } : {}),
    },
  }, req.auth.role);
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Invite failed' });
    return res.redirect(`/team/users?${params.toString()}`);
  }
  res.redirect('/team/users?invited=1');
}));

router.post('/users/:id/resend-invite', requireTenantAdmin, asyncHandler(async (req, res) => {
  const result = await authService.resendUserInvite(
    req.auth.tenantId,
    req.params.id,
    req.auth.role,
  );
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error || 'Resend failed' });
    return res.redirect(`/team/users?${params.toString()}`);
  }
  res.redirect('/team/users?resent=1');
}));

module.exports = router;
