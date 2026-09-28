'use strict';

const { listSerialPorts } = require('../../system/serialPorts');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const persistence = require('../../persistence');
const { normalizePens } = require('../../graph/graphPens');
const { moveOnce, moveReverse, connectSide, readWords } = require('../../drivers/modbusMove');
const { defaultModbusRtuSerialPort } = require('../../appliance/defaultRs485Port');
const { pushRemoteTagForce } = require('../pushRemoteTagForce');

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

  router.post('/debug/force', async (req, res) => {
    const { tagStore } = deps;
    try {
      const t = tagStore.setForce(req.body.tagId, {
        forceInput: req.body.forceInput,
        forceOutput: req.body.forceOutput,
        forceValue: req.body.forceValue,
      });
      if (!t) return res.status(404).json({ error: 'Tag not found' });
      try {
        await pushRemoteTagForce(driverManager, scanEngine, t, tagStore);
      } catch (e) {
        return res.status(502).json({ error: e.message || 'Remote force failed', tag: t });
      }
      res.json({ tag: t });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/debug/force', async (req, res) => {
    const { tagStore } = deps;
    const t = tagStore.clearForce(req.query.tagId, req.query.which || null);
    try {
          if (t) await pushRemoteTagForce(driverManager, scanEngine, t, tagStore);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Remote force clear failed', tag: t });
    }
    res.json({ tag: t });
  });

  router.post('/graph/clear', (req, res) => {
    graphHistory.clear(req.body?.tagId);
    res.json({ ok: true });
  });

  router.post('/modbus/move', async (req, res) => {
    const fn = req.body.direction === 'tcp_to_rtu' ? moveReverse : moveOnce;
    res.json({ ok: true, results: await fn(req.body) });
  });

  router.post('/modbus/probe', async (req, res) => {
    const body = req.body || {};
    const side = {
      serialPort: body.serialPort || defaultModbusRtuSerialPort(),
      baud: body.baud ?? 9600,
      slaveId: body.slaveId ?? 1,
      parity: body.parity || 'none',
      stopBits: body.stopBits ?? 1,
      timeoutMs: body.timeoutMs ?? 3000,
    };
    const probes = [
      { label: 'FC01 readCoils @0 x8', table: 'coil', address: 0, count: 8 },
      { label: 'FC02 readDiscreteInputs @0 x8', table: 'discrete', address: 0, count: 8 },
      { label: 'FC03 readHoldingRegisters @0x4000 x1 (device addr)', table: 'holding', address: 0x4000, count: 1 },
      { label: 'FC03 readHoldingRegisters @0x8000 x1 (fw version)', table: 'holding', address: 0x8000, count: 1 },
    ];
    let client;
    const reads = [];
    try {
      client = await connectSide(side, 'rtu');
      for (const p of probes) {
        try {
          const result = await readWords(client, p.table, p.address, p.count);
          reads.push({ ...p, ok: true, data: result.data });
        } catch (e) {
          reads.push({ ...p, ok: false, error: e.message || String(e) });
        }
      }
      const okCount = reads.filter((r) => r.ok).length;
      res.json({
        ok: okCount > 0,
        serialPort: side.serialPort,
        baud: side.baud,
        slaveId: side.slaveId,
        summary: `${okCount}/${reads.length} reads succeeded`,
        reads,
      });
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: e.message || String(e),
        serialPort: side.serialPort,
        slaveId: side.slaveId,
      });
    } finally {
      if (client) {
        try { await client.close(); } catch { /* ignore */ }
      }
    }
  });

  return router;
}

module.exports = { createMiscRoutes };
