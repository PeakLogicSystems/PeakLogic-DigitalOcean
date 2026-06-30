'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const authService = require('../services/authService');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');

const router = express.Router();
router.use(attachAuth, requireWebAuth);

function requireTenantAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  return next();
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
    message: req.query.invited ? 'Invite sent.' : req.query.resent ? 'Invite resent.' : null,
    error: req.query.error || null,
  });
}));

router.post('/users/invite', requireTenantAdmin, asyncHandler(async (req, res) => {
  const result = await authService.inviteTenantUser(req.auth.tenantId, {
    email: req.body.email,
    role: req.body.role,
    profile: {
      displayName: req.body.displayName || '',
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
