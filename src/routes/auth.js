'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { signToken } = require('../auth/jwt');
const authService = require('../services/authService');
const { authenticate, isPlatformAdminRequest } = require('../auth/middleware');

const router = express.Router();

router.post('/signup', asyncHandler(async (req, res) => {
  const result = await authService.signup(req.body || {}, {
    platformAdmin: isPlatformAdminRequest(req),
    enabledBy: isPlatformAdminRequest(req) ? 'platform-admin' : null,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  const token = signToken({
    userId: result.user.id,
    tenantId: result.tenant.id,
    role: result.user.role,
    email: result.user.email,
  });
  res.status(201).json({ token, tenant: result.tenant, user: result.user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const result = await authService.login(req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  const token = signToken({
    userId: result.user.id,
    tenantId: result.tenant.id,
    role: result.user.role,
    email: result.user.email,
  });
  res.json({ token, tenant: result.tenant, user: result.user });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const [user, tenant] = await Promise.all([
    authService.getUserById(req.auth.tenantId, req.auth.userId),
    authService.getTenantById(req.auth.tenantId),
  ]);
  if (!user || !tenant) return res.status(404).json({ error: 'Account not found' });
  res.json({ user, tenant });
}));

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const result = await authService.updateUserProfile(
    req.auth.tenantId,
    req.auth.userId,
    req.body || {},
    { admin: false },
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const result = await authService.resetPasswordWithToken(req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.auth.tenantId,
    req.auth.userId,
    req.body || {},
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

module.exports = router;
