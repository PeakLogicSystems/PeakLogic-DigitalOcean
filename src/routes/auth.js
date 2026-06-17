'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { signToken } = require('../auth/jwt');
const authService = require('../services/authService');
const { authenticate } = require('../auth/middleware');

const router = express.Router();

router.post('/signup', asyncHandler(async (req, res) => {
  const result = await authService.signup(req.body || {});
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

module.exports = router;
