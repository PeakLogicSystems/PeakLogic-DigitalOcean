'use strict';

function createAlarmRoutes(deps) {
  const { tagStore } = deps;
  const router = require('express').Router();

  router.post('/alarms/ack', (req, res) => {
    const body = req.body || {};
    if (body.all) {
      const count = tagStore.ackAllAlarms();
      return res.json({ ok: true, count });
    }
    const tagId = String(body.tagId || '').trim();
    if (!tagId) {
      return res.status(400).json({ error: 'tagId required (or all: true)' });
    }
    if (!tagStore.get(tagId)) {
      return res.status(404).json({ error: 'tag not found' });
    }
    const ok = tagStore.ackAlarm(tagId);
    if (!ok) {
      return res.status(409).json({ error: 'tag has no active alarm' });
    }
    return res.json({ ok: true, tagId });
  });

  return router;
}

module.exports = { createAlarmRoutes };
