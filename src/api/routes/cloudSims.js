'use strict';

const simManager = require('../../cloud/simManager');
const { isCloudSimsEnabled } = require('../../cloud/cloudSimsEnabled');

function requireCloudSims(req, res, next) {
  if (!isCloudSimsEnabled()) {
    return res.status(403).json({
      error: 'Cloud sim management requires PEAKLOGIC_DEPLOYMENT=cloud, PEAKLOGIC_CLOUD_SIMS=1, or settings cloudSims.enabled',
    });
  }
  return next();
}

function createCloudSimRoutes() {
  const router = require('express').Router();
  // Scoped to /cloud only — see cellularSims.js for why this must not be a
  // blanket router.use(requireCloudSims) with no path.
  router.use('/cloud', requireCloudSims);

  router.get('/cloud/sims/status', (req, res) => {
    res.json({ ok: true, ...simManager.managerStatus() });
  });

  router.get('/cloud/sims', async (req, res) => {
    try {
      const sims = await simManager.listSims();
      res.json({ ok: true, sims, count: sims.length });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cloud/sims', async (req, res) => {
    try {
      const sim = await simManager.createSim(req.body || {});
      res.status(201).json({ ok: true, sim });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.get('/cloud/sims/:id', async (req, res) => {
    try {
      const sim = await simManager.getSim(req.params.id);
      if (!sim) return res.status(404).json({ error: 'Sim not found' });
      return res.json({ ok: true, sim });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.put('/cloud/sims/:id', async (req, res) => {
    try {
      const sim = await simManager.updateSim(req.params.id, req.body || {});
      if (!sim) return res.status(404).json({ error: 'Sim not found' });
      return res.json({ ok: true, sim });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.delete('/cloud/sims/:id', async (req, res) => {
    try {
      const ok = await simManager.deleteSim(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Sim not found' });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  router.post('/cloud/sims/:id/start', async (req, res) => {
    try {
      const result = await simManager.startSim(req.params.id);
      if (!result) return res.status(404).json({ error: 'Sim not found' });
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(e.status || 502).json({
        error: e.message || String(e),
        sim: e.sim || undefined,
      });
    }
  });

  router.post('/cloud/sims/:id/stop', async (req, res) => {
    try {
      const result = await simManager.stopSim(req.params.id);
      if (!result) return res.status(404).json({ error: 'Sim not found' });
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createCloudSimRoutes, requireCloudSims };
