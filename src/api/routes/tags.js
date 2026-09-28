'use strict';

const { MAX_TAGS } = require('../../config');
const programStore = require('../../programs/programStore');
const { ensureMotorTags } = require('../../programs/motorTags');
const { ensureTpoTags } = require('../../programs/tpoTags');
const { ensureProgramTags } = require('../../programs/ensureProgramTags');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const { canWriteHmiTag } = require('../../tenants/hmiOperatorPolicy');

function createTagRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/tags', (req, res) => {
    const { syncMqttParcLiveIo } = require('../../parc/parcLiveIoSync');
    syncMqttParcLiveIo(tagStore, driverManager);
    res.json({ tags: tagStore.list(), count: tagStore.count(), max: MAX_TAGS });
  });

  router.put('/tags', (req, res) => {
    tagStore.replaceAll(req.body.tags || []);
    res.json({ ok: true, count: tagStore.count() });
  });

  router.post('/tags/ensure-motor', (req, res) => {
    const { added, labeled, count } = ensureMotorTags(tagStore);
    res.json({ ok: true, added, labeled, count });
  });

  router.post('/tags/ensure-tpo', (req, res) => {
    const { added, labeled, migrated, repaired, count } = ensureTpoTags(tagStore);
    res.json({ ok: true, added, labeled, migrated, repaired, count });
  });

  router.post('/tags/ensure-program', (req, res) => {
    const source = req.body?.source ?? programStore.readActive();
    const { added, labeled, errors, count } = ensureProgramTags(tagStore, source);
    if (errors?.length) {
      return res.status(400).json({ error: errors.join('; '), errors, added, labeled, count });
    }
    res.json({ ok: true, added, labeled, count });
  });

  function writeRowsFromBody(body) {
    if (Array.isArray(body?.tags) && body.tags.length) {
      return body.tags.map((row) => ({
        tagId: row?.tagId || row?.id,
        value: row?.value,
      }));
    }
    return [{ tagId: body?.tagId, value: body?.value }];
  }

  function ensureTagsForWrite(tagId) {
    if (/^TPO1_(ON_MIN|OFF_MIN|PULSE_REM)$/.test(String(tagId))) {
      ensureTpoTags(tagStore);
    }
    if (/^MOTOR\d+_(START|STOP|HAND|HOA)$/.test(String(tagId))) {
      ensureMotorTags(tagStore);
      const n = String(tagId).match(/^MOTOR(\d+)/i)?.[1];
      const handId = n ? `MOTOR${n}_HAND` : '';
      if (handId && !tagStore.get(handId) && tagStore.get(`MOTOR${n}_HOA`)) {
        tagStore.upsert({
          id: handId,
          label: `Pump ${n} hand run latch`,
          type: 'BOOL',
          role: 'memory',
          value: false,
        });
      }
    }
  }

  router.post('/tags/write', async (req, res) => {
    const rows = writeRowsFromBody(req.body).filter((row) => row.tagId);
    if (!rows.length) {
      return res.status(400).json({ error: 'tagId required' });
    }
    const written = [];
    try {
      for (const row of rows) {
        ensureTagsForWrite(row.tagId);
        if (isCloudDeployment() && req.mvAuth?.user) {
          if (!canWriteHmiTag(req.mvAuth.user, row.tagId, row.value, tagStore)) {
            return res.status(403).json({
              error: 'HMI write not allowed for your role — use Hand mode for operator controls.',
            });
          }
        }
        const t = tagStore.writeHmiMemory(row.tagId, row.value);
        if (!t) {
          return res.status(404).json({ error: `Tag not found: ${row.tagId}` });
        }
        written.push(t);
      }
      try {
        const { pushRemoteHmiMemoryMany } = require('../pushRemoteHmiMemory');
        await pushRemoteHmiMemoryMany(driverManager, scanEngine, written);
      } catch (e) {
        return res.status(502).json({
          error: e.message || 'Remote HMI write failed',
          tag: written[0],
          tags: written,
        });
      }
      res.json({ tag: written[0], tags: written });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createTagRoutes };
