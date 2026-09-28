'use strict';

const persistence = require('../../persistence');
const pdmService = require('../../pdm/pdmService');
const { normalizePdmSettings } = require('../../settings/pdmSettings');
const { getBatchScheduler } = require('./pdmSchedulerHolder');

function createPdmRoutes() {
  const router = require('express').Router();

  router.get('/pdm/status', (req, res) => {
    const settings = persistence.readJson('settings.json', {});
    const scheduler = getBatchScheduler();
    res.json({
      ...pdmService.batchStatus(settings),
      scheduler: scheduler?.status?.() || null,
    });
  });

  router.get('/pdm/assets', (req, res) => {
    const settings = persistence.readJson('settings.json', {});
    const pdm = normalizePdmSettings(settings.pdm, settings);
    res.json({ assets: Object.keys(pdm.assetTags || {}).sort(), pdm });
  });

  router.get('/pdm/view', async (req, res) => {
    const assetId = String(req.query.asset || '').trim();
    if (!assetId) return res.status(400).json({ error: 'asset query param required' });
    const from = req.query.from ? Date.parse(req.query.from) : undefined;
    const to = req.query.to ? Date.parse(req.query.to) : undefined;
    const result = await pdmService.loadPdmView(assetId, { fromMs: from, toMs: to });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  router.put('/pdm/settings', (req, res) => {
    const prev = persistence.readJson('settings.json', {});
    const pdm = normalizePdmSettings(req.body?.pdm ?? req.body, prev);
    const next = { ...prev, pdm };
    persistence.writeJson('settings.json', next);
    res.json({ ok: true, pdm, settings: next });
  });

  router.post('/pdm/build', async (req, res) => {
    const scheduler = getBatchScheduler();
    const result = scheduler?.runNow
      ? await scheduler.runNow()
      : await pdmService.buildAllFeatures();
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  router.post('/pdm/sim/motor', async (req, res) => {
    const result = await pdmService.simulateMotorStart(req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  return router;
}

module.exports = { createPdmRoutes };
