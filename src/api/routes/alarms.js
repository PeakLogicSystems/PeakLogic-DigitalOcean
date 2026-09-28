'use strict';

const { isAlarmActive, isAlarmCapableType } = require('../../tags/tagAnalog');

function createAlarmRoutes(deps) {
  const { tagStore } = deps;
  const router = require('express').Router();

  router.get('/alarms', (req, res) => {
    const tags = tagStore.list();
    const live = tagStore.liveSnapshot();
    const liveMap = new Map(live.map((e) => [e.tagId, e]));
    const rows = [];
    for (const t of tags) {
      if (!t.alarmsEnabled || !isAlarmCapableType(t.type)) continue;
      const le = liveMap.get(t.id);
      const level = le?.alarmLevel || t.alarmLevel || null;
      if (!isAlarmActive(level)) continue;
      rows.push({
        tagId: t.id,
        label: t.label || '',
        type: t.type,
        level,
        value: le?.value,
        acked: !!(le?.alarmAcked),
        since: le?.alarmSince || null,
      });
    }
    rows.sort((a, b) => String(a.tagId).localeCompare(String(b.tagId)));
    return res.json({ alarms: rows });
  });

  router.post('/alarms/ack', (req, res) => {
    const body = req.body || {};
    if (body.all) {
      const count = tagStore.ackAllAlarms();
      return res.json({ ok: true, count, live: tagStore.liveSnapshot() });
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
    return res.json({ ok: true, tagId, live: tagStore.liveSnapshot() });
  });

  return router;
}

module.exports = { createAlarmRoutes };
