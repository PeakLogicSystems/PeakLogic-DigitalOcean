'use strict';

const mongoSysLog = require('../../logger/mongoSysLog');

function createSysLogRoutes() {
  const router = require('express').Router();

  router.get('/sys-log/status', (req, res) => {
    res.json(mongoSysLog.status());
  });

  router.get('/sys-log', async (req, res) => {
    try {
      const filter = { tenantId: mongoSysLog.status().tenantId };
      const level = String(req.query.level || '').trim();
      const category = String(req.query.category || '').trim();
      if (level) filter.level = level;
      if (category) filter.category = category;
      const entries = await mongoSysLog.query(filter, {
        limit: req.query.limit,
        since: req.query.since,
        until: req.query.until,
        userId: req.query.userId || req.query.user,
      });
      res.json({ ok: true, entries });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/sys-log/maintenance', async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'message required' });
      const entry = await mongoSysLog.append({
        level: 'maintenance',
        category: String(req.body?.category || 'manual').slice(0, 64),
        message,
        detail: req.body?.detail && typeof req.body.detail === 'object' ? req.body.detail : {},
        user: req.peaklogicUser || undefined,
      });
      res.json({ ok: true, entry });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createSysLogRoutes };
