'use strict';

const express = require('express');
const { asyncHandler } = require('../../util/http');
const { requireRole } = require('../../auth/middleware');
const authService = require('../../services/authService');

/**
 * Studio alarm-notification users backed by Mongo tenant accounts (cloud SaaS).
 * Same paths/shape as appliance userStore routes so app.js works unchanged.
 */
function createCloudStudioUserRoutes() {
  const router = express.Router();

  router.get('/users', asyncHandler(async (req, res) => {
    if (req.auth.role === 'admin') {
      const users = await authService.listTenantUsers(req.auth.tenantId);
      return res.json({ users });
    }
    const user = await authService.getUserById(req.auth.tenantId, req.auth.userId);
    return res.json({ users: user ? [user] : [] });
  }));

  router.get('/users/:id', asyncHandler(async (req, res) => {
    if (req.params.id !== req.auth.userId && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await authService.getUserById(req.auth.tenantId, req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  }));

  router.post('/users', requireRole('admin'), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = String(body.password || '');
    const result = password.length >= 8
      ? await authService.createTenantUser(req.auth.tenantId, body, req.auth.role)
      : await authService.inviteTenantUser(req.auth.tenantId, body, req.auth.role);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ user: result.user, invited: !!result.invited });
  }));

  async function updateUser(req, res) {
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
    return res.json({ user: result.user });
  }

  router.put('/users/:id', asyncHandler(updateUser));
  router.patch('/users/:id', asyncHandler(updateUser));

  router.delete('/users/:id', requireRole('admin'), (req, res) => {
    res.status(501).json({
      error: 'Remove users from Team (/team/users). Alarm profiles are login accounts on cloud.',
    });
  });

  return router;
}

module.exports = { createCloudStudioUserRoutes };
