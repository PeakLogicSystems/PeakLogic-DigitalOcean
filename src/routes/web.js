'use strict';

const express = require('express');
const { version: APP_VERSION } = require('../../package.json');
const { asyncHandler } = require('../util/http');
const { signToken } = require('../auth/jwt');
const { setAuthCookie, clearAuthCookie, getTokenFromRequest } = require('../auth/webSession');
const { attachAuth, requireWebAuth } = require('../auth/middleware');
const { loadShellContext, applyShellLocals } = require('../web/shellContext');
const { EDITION } = require('../config');
const authService = require('../services/authService');

function servicePayload() {
  return {
    service: EDITION.product,
    edition: EDITION.label,
    platform: EDITION.platform,
    version: APP_VERSION,
    description: EDITION.tagline,
    links: {
      health: '/health',
      login: '/login',
      cmms: '/cmms',
    },
  };
}

const router = express.Router();
router.use(attachAuth);

function safeNextPath(raw) {
  const next = String(raw || '').trim();
  if (!next.startsWith('/') || next.startsWith('//')) return '';
  if (next.startsWith('/login') || next.startsWith('/logout')) return '';
  return next;
}

router.get('/login', (req, res) => {
  if (req.auth && getTokenFromRequest(req)) {
    return res.redirect(safeNextPath(req.query.next) || '/studio');
  }
  res.render('login', {
    title: 'Sign in',
    error: req.query.error || null,
    message: req.query.message || null,
    tenantSlug: req.query.tenantSlug || 'demo',
    email: req.query.email || '',
    next: safeNextPath(req.query.next) || '',
  });
});

router.post('/login', asyncHandler(async (req, res) => {
  const result = await authService.login({
    tenantSlug: req.body.tenantSlug,
    email: req.body.email,
    password: req.body.password,
  });
  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.error || 'Invalid credentials',
      tenantSlug: String(req.body.tenantSlug || ''),
      email: String(req.body.email || ''),
    });
    return res.redirect(`/login?${params.toString()}`);
  }
  const token = signToken({
    userId: result.user.id,
    tenantId: result.tenant.id,
    role: result.user.role,
    email: result.user.email,
  });
  setAuthCookie(res, token, req);
  const next = safeNextPath(req.body.next || req.query.next);
  res.redirect(next || '/studio');
}));

router.get('/logout', (req, res) => {
  clearAuthCookie(res, req);
  res.redirect('/login');
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    title: 'Forgot password',
    error: req.query.error || null,
    message: req.query.message || null,
    tenantSlug: req.query.tenantSlug || 'demo',
    email: req.query.email || '',
  });
});

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset({
    tenantSlug: req.body.tenantSlug,
    email: req.body.email,
  });
  const params = new URLSearchParams({
    tenantSlug: String(req.body.tenantSlug || ''),
    email: String(req.body.email || ''),
  });
  if (!result.ok) {
    params.set('error', result.error || 'Unable to send reset email');
  } else {
    params.set('message', 'If an account exists, a reset link was sent to that email.');
  }
  res.redirect(`/forgot-password?${params.toString()}`);
}));

router.get('/reset-password', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.redirect('/forgot-password?error=Missing%20reset%20token');
  }
  res.render('reset-password', {
    title: 'Reset password',
    token,
    error: req.query.error || null,
  });
});

router.post('/reset-password', asyncHandler(async (req, res) => {
  const result = await authService.resetPasswordWithToken({
    token: req.body.token,
    password: req.body.password,
    purpose: 'reset',
  });
  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.error || 'Reset failed',
      token: String(req.body.token || ''),
    });
    return res.redirect(`/reset-password?${params.toString()}`);
  }
  res.redirect('/login?message=Password%20updated.%20Sign%20in%20with%20your%20new%20password.');
}));

router.get('/accept-invite', asyncHandler(async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.redirect('/login?error=Missing%20invite%20token');
  }
  const meta = await authService.getInviteTokenMeta(token);
  if (!meta) {
    return res.render('accept-invite', {
      title: 'Accept invite',
      token,
      invalid: true,
      error: 'This invite link is invalid or has expired.',
      tenantName: null,
      email: null,
      tenantSlug: null,
    });
  }
  res.render('accept-invite', {
    title: 'Accept invite',
    token,
    invalid: false,
    error: req.query.error || null,
    tenantName: meta.tenantName,
    email: meta.email,
    tenantSlug: meta.tenantSlug,
  });
}));

router.post('/accept-invite', asyncHandler(async (req, res) => {
  const result = await authService.resetPasswordWithToken({
    token: req.body.token,
    password: req.body.password,
    purpose: 'invite',
  });
  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.error || 'Could not accept invite',
      token: String(req.body.token || ''),
    });
    return res.redirect(`/accept-invite?${params.toString()}`);
  }
  res.redirect('/login?message=Account%20ready.%20Sign%20in%20with%20your%20new%20password.');
}));

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.format === 'json') {
    return res.json(servicePayload());
  }
  if (!req.auth) {
    return res.redirect('/login');
  }
  const ctx = await loadShellContext(req);
  if (!ctx) {
    clearAuthCookie(res, req);
    return res.redirect('/login?error=Session%20expired');
  }
  let cmmsNotice = null;
  if (req.query.cmms === 'disabled') {
    cmmsNotice = 'CMMS is not enabled for your organization.';
  }
  applyShellLocals(res, ctx, {
    activeNav: 'home',
    title: 'Home',
    version: APP_VERSION,
    cmmsNotice,
  });
  res.render('cloud-home', {
    cmmsNotice,
    user: ctx.user,
    tenant: ctx.tenant,
    cmmsEnabled: ctx.cmmsEnabled,
    activeNav: 'home',
    title: 'Home',
  });
}));

module.exports = router;
module.exports.servicePayload = servicePayload;
