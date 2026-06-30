'use strict';

const express = require('express');
const { asyncHandler } = require('../util/http');
const { authenticate, requireRole } = require('../auth/middleware');
const authService = require('../services/authService');

const router = express.Router();
router.use(authenticate);

router.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const users = await authService.listTenantUsers(req.auth.tenantId);
  res.json({ users });
}));

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await authService.createTenantUser(req.auth.tenantId, req.body || {}, req.auth.role);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ user: result.user });
}));

router.post('/invite', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await authService.inviteTenantUser(req.auth.tenantId, req.body || {}, req.auth.role);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ user: result.user, invited: true });
}));

router.post('/:id/resend-invite', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await authService.resendUserInvite(
    req.auth.tenantId,
    req.params.id,
    req.auth.role,
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user, invited: true });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  if (req.params.id !== req.auth.userId && req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = await authService.getUserById(req.auth.tenantId, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const isSelf = req.params.id === req.auth.userId;
  if (!isSelf && req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await authService.updateUserProfile(
    req.auth.tenantId,
    req.params.id,
    req.body || {},
    { admin: req.auth.role === 'admin' },
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user });
}));

module.exports = router;
