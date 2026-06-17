'use strict';

const persistence = require('../../persistence');
const { listPresets, buildFromPreset, getPreset } = require('../../devices/devicePresets');
const { nextSlaveId, offsetTagsForDriver } = require('../../devices/applyPresetUtils');
const { MAX_TAGS } = require('../../config');

function createDriverRoutes(deps) {
  const { tagStore, driverManager, scanEngine } = deps;
  const router = require('express').Router();

  router.get('/drivers', (req, res) => {
    res.json({ drivers: driverManager.list(), health: driverManager.health() });
  });

  router.put('/drivers', async (req, res) => {
    const drivers = [...(req.body.drivers || [])];
    const warnings = [];
    const rtuPorts = new Map();
    for (const d of drivers) {
      if (d.type === 'modbus_rtu' && d.enabled !== false && d.serialPort) {
        const port = String(d.serialPort).toUpperCase();
        if (rtuPorts.has(port)) {
          d.enabled = false;
          warnings.push(
            `Disabled duplicate driver "${d.id}" — ${port} is already used by "${rtuPorts.get(port)}"`
          );
        } else {
          rtuPorts.set(port, d.id);
        }
      }
    }
    driverManager.save(drivers);
    await driverManager.rebuild();
    res.json({ ok: true, warnings, health: driverManager.health() });
  });

  router.post('/drivers/test', async (req, res) => {
    try {
      res.json({ result: await driverManager.testConnection(req.body) });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  router.post('/drivers/connect', async (req, res) => {
    const id = req.body?.driverId;
    if (!id) return res.status(400).json({ error: 'driverId required' });
    try {
      await driverManager.connectDriver(id);
      res.json({ ok: true, health: driverManager.health() });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e), health: driverManager.health() });
    }
  });

  router.post('/drivers/disconnect', async (req, res) => {
    const id = req.body?.driverId;
    if (!id) return res.status(400).json({ error: 'driverId required' });
    try {
      await driverManager.disconnectDriver(id);
      res.json({ ok: true, health: driverManager.health() });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e), health: driverManager.health() });
    }
  });

  router.get('/devices/presets', (req, res) => {
    res.json({ presets: listPresets() });
  });

  router.post('/devices/apply', async (req, res) => {
    const replaceTags = req.body.replaceTags === true;
    const built = buildFromPreset(req.body.presetId, {
      driverId: req.body.driverId,
      serialPort: req.body.serialPort,
      host: req.body.host,
      port: req.body.port != null ? +req.body.port : undefined,
      baud: req.body.baud != null ? +req.body.baud : undefined,
      slaveId: req.body.slaveId != null ? +req.body.slaveId : undefined,
      parity: req.body.parity,
      stopBits: req.body.stopBits != null ? +req.body.stopBits : undefined,
    });
    const driverList = driverManager.list();
    const driverIdx = driverList.findIndex((d) => d.id === built.driver.id);
    const driverExists = driverIdx >= 0;
    const driverListOut = driverExists
      ? driverList.map((d, i) => (i === driverIdx ? { ...d, ...built.driver } : d))
      : [...driverList, built.driver];
    driverManager.save(driverListOut);

    const tagList = tagStore.list();
    const presetMeta = getPreset(req.body.presetId);
    const sharedBus = presetMeta?.sharedBus !== false;
    let templateTags = built.tags;
    let assignedSlave = built.driver.slaveId ?? 1;
    if (!replaceTags) {
      const fallback = req.body.slaveId != null ? +req.body.slaveId : (built.driver.slaveId ?? 1);
      assignedSlave = sharedBus
        ? nextSlaveId(driverList, tagList, built.driver, fallback)
        : fallback;
      templateTags = offsetTagsForDriver(built.tags, built.driver.id, tagList, assignedSlave);
    }

    let merged;
    if (driverExists && !replaceTags) {
      const existingIds = new Set(tagList.map((t) => t.id));
      const conflicts = templateTags.filter((t) => existingIds.has(t.id));
      if (conflicts.length) {
        return res.status(409).json({
          error: `Tag id already in use: ${conflicts.map((t) => t.id).join(', ')}`,
        });
      }
      merged = [...tagList, ...templateTags];
    } else {
      const stripped = tagList.filter((t) => t.driverId !== built.driver.id);
      merged = [...stripped, ...templateTags];
    }
    if (merged.length > MAX_TAGS) {
      return res.status(413).json({ error: `Tag limit ${MAX_TAGS} exceeded (${merged.length})` });
    }
    tagStore.replaceAll(merged);
    if (built.driver?.type === 'opta_remote' || built.driver?.type === 'mqtt_fleet') {
      const settings = persistence.readJson('settings.json', {});
      settings.remoteExecution = true;
      persistence.writeJson('settings.json', settings);
    }
    await driverManager.rebuild();
    if (scanEngine) scanEngine.loadSettings();
    res.json({
      ok: true,
      preset: built.preset,
      driver: built.driver,
      tagsAdded: templateTags.length,
      tagCount: tagStore.count(),
      merged: driverExists && !replaceTags,
      slaveId: assignedSlave,
    });
  });

  return router;
}

module.exports = { createDriverRoutes };
