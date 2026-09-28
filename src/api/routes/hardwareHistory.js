'use strict';

const hardwareHistoryStore = require('../../hardware/hardwareHistoryStore');

function createHardwareHistoryRoutes(deps) {
  const { driverManager } = deps;
  const router = require('express').Router();

  router.get('/hardware-history/status', (req, res) => {
    res.json(hardwareHistoryStore.status());
  });

  router.get('/hardware-history', async (req, res) => {
    try {
      const positionId = String(req.query.positionId || '').trim();
      const serial = String(req.query.serial || req.query.serialNumber || '').trim();
      const limit = req.query.limit;
      if (positionId) {
        const rows = await hardwareHistoryStore.listByPosition(positionId, { limit });
        const current = await hardwareHistoryStore.getCurrentAssignment(positionId);
        return res.json({ ok: true, positionId, current, assignments: rows });
      }
      if (serial) {
        const rows = await hardwareHistoryStore.listBySerial(serial, { limit });
        return res.json({ ok: true, serialNumber: serial, assignments: rows });
      }
      const recent = req.query.recent === '1' || req.query.recent === 'true';
      if (recent || req.query.all === '1' || req.query.all === 'true') {
        const rows = await hardwareHistoryStore.listRecent({ limit });
        return res.json({ ok: true, assignments: rows });
      }
      return res.status(400).json({ error: 'positionId, serial, or recent=1 query required' });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.post('/hardware-history/import-drivers', async (req, res) => {
    try {
      const drivers = req.body?.drivers || driverManager.list();
      const result = await hardwareHistoryStore.importFromDriverHistories(drivers);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createHardwareHistoryRoutes };
