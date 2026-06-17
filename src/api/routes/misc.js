'use strict';

const { listSerialPorts } = require('../../system/serialPorts');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const persistence = require('../../persistence');
const { normalizePens } = require('../../graph/graphPens');
const { moveOnce, moveReverse } = require('../../drivers/modbusMove');

function mergeSeedPens(existingPens, seedPens, tagList) {
  const byTag = new Map((existingPens || []).map((p) => [p.tagId, p]));
  for (const p of seedPens) byTag.set(p.tagId, p);
  return normalizePens([...byTag.values()], tagList);
}

function createMiscRoutes(deps) {
  const { graphHistory, tagStore, scanEngine, driverManager } = deps;
  const router = require('express').Router();

  router.get('/logger/mongo/status', (req, res) => {
    const { DEFAULT_MONGO_LOGGER } = require('../../settings/mongoLoggerSettings');
    res.json({ ...mongoTagLogger.status(), defaults: DEFAULT_MONGO_LOGGER });
  });

  router.get('/logger/mongo/history', async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params required (ISO 8601)' });
    }
    const tags = (req.query.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
    const projectName = req.query.project || undefined;
    const limit = parseInt(req.query.limit || '5000', 10);
    const result = await mongoTagLogger.queryPenHistory({
      from,
      to,
      tagIds: tags.length ? tags : undefined,
      projectName,
      limitPerTag: limit,
    });
    if (!result.ok) {
      const code = result.error?.includes('not configured') || result.error?.includes('not connected')
        ? 503
        : 400;
      return res.status(code).json({ error: result.error });
    }
    res.json(result);
  });

  router.post('/logger/mongo/purge', async (req, res) => {
    const all = req.body?.all === true;
    const tags = (req.body?.tags || []).map((s) => String(s).trim()).filter(Boolean);
    const result = await mongoTagLogger.purgeHistory({
      from: req.body?.from,
      to: req.body?.to,
      tagIds: tags.length ? tags : undefined,
      projectName: req.body?.project || undefined,
      events: req.body?.events,
      all,
    });
    if (!result.ok) {
      const code = result.error?.includes('not configured') || result.error?.includes('not connected')
        ? 503
        : 400;
      return res.status(code).json({ error: result.error });
    }
    res.json(result);
  });

  router.post('/logger/mongo/seed', async (req, res) => {
    const projectName = req.body?.projectName || 'seed_demo';
    const result = await mongoTagLogger.seedDemoHistory({
      days: req.body?.days,
      intervalMs: req.body?.intervalMs,
      projectName,
    });
    if (!result.ok) {
      const code = result.error?.includes('not configured') || result.error?.includes('not connected')
        ? 503
        : 400;
      return res.status(code).json({ error: result.error });
    }
    if (req.body?.installTags !== false && tagStore) {
      for (const t of result.tagDefinitions || []) {
        const prev = tagStore.get(t.id);
        tagStore.upsert(prev ? { ...prev, ...t, id: t.id } : t);
      }
      tagStore.save();
      const settings = persistence.readJson('settings.json', {});
      const tagList = tagStore.list();
      const graphPens = mergeSeedPens(settings.graphPens, result.pens, tagList);
      persistence.writeJson('settings.json', { ...settings, graphPens });
      if (scanEngine) scanEngine.loadSettings();
      result.installedTags = (result.tagDefinitions || []).map((t) => t.id);
      result.graphPens = graphPens;
    }
    res.json(result);
  });

  router.get('/system/serial-ports', async (req, res) => {
    res.json({ ports: await listSerialPorts() });
  });

  router.get('/hal/status', (req, res) => {
    if (!driverManager?.halStatus) {
      return res.json({ nativeAvailable: false, drivers: [] });
    }
    res.json(driverManager.halStatus());
  });

  router.post('/debug/force', (req, res) => {
    const { tagStore } = deps;
    try {
      const t = tagStore.setForce(req.body.tagId, {
        forceInput: req.body.forceInput,
        forceOutput: req.body.forceOutput,
        forceValue: req.body.forceValue,
      });
      if (!t) return res.status(404).json({ error: 'Tag not found' });
      res.json({ tag: t });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/debug/force', (req, res) => {
    const { tagStore } = deps;
    res.json({ tag: tagStore.clearForce(req.query.tagId, req.query.which || null) });
  });

  router.post('/graph/clear', (req, res) => {
    graphHistory.clear(req.body?.tagId);
    res.json({ ok: true });
  });

  router.post('/modbus/move', async (req, res) => {
    const fn = req.body.direction === 'tcp_to_rtu' ? moveReverse : moveOnce;
    res.json({ ok: true, results: await fn(req.body) });
  });

  return router;
}

module.exports = { createMiscRoutes };
