'use strict';

const userStore = require('../../users/userStore');

function createUserRoutes() {
  const router = require('express').Router();

  router.get('/users', (req, res) => {
    res.json({ users: userStore.listUsers() });
  });

  router.get('/users/notification-scope-catalog', (req, res) => {
    const { buildApplianceScopeCatalog } = require('../../users/notificationScopeCatalog');
    res.json(buildApplianceScopeCatalog());
  });

  router.get('/users/:id', (req, res) => {
    const user = userStore.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  });

  router.post('/users', (req, res) => {
    const result = userStore.createUser(req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ user: result.user });
  });

  router.put('/users/:id', (req, res) => {
    const result = userStore.updateUser(req.params.id, req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ user: result.user });
  });

  router.delete('/users/:id', (req, res) => {
    const result = userStore.deleteUser(req.params.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(204).end();
  });

  return router;
}

module.exports = { createUserRoutes };
