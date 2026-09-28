'use strict';

const persistence = require('../../persistence');
const { normalizeInferenceSettings } = require('../../settings/inferenceSettings');
const { runHostInferenceFromReport, hostInferenceStatus } = require('../../inference/hostInference');

function createInferenceRoutes() {
  const router = require('express').Router();

  router.get('/inference/status', (req, res) => {
    const settings = persistence.readJson('settings.json', {});
    res.json({
      ok: true,
      ...hostInferenceStatus(settings),
      settings: normalizeInferenceSettings(settings.inference, settings),
    });
  });

  router.post('/inference/run', async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ ok: false, error: 'JSON body required (Parc telemetry report)' });
        return;
      }
      const settings = persistence.readJson('settings.json', {});
      const result = await runHostInferenceFromReport(body, { settings });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createInferenceRoutes };
